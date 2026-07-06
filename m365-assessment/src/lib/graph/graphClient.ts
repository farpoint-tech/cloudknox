/**
 * Minimal Microsoft Graph client for the browser.
 *
 * Centralises the three things every one of the old PowerShell scripts got
 * wrong individually:
 *   - full @odata.nextLink pagination (never truncate large tenants)
 *   - 429 / 503 throttling handling with Retry-After + exponential backoff
 *   - one consistent auth/error surface
 *
 * It is deliberately dependency-free and testable: fetch and sleep are
 * injectable so the retry/pagination logic can be unit-tested without a tenant.
 */

export type GraphVersion = "v1.0" | "beta";

export interface GraphClientOptions {
  /** Returns a bearer access token for Microsoft Graph. */
  getToken: () => Promise<string>;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  /** Max retries for throttled/5xx responses. */
  maxRetries?: number;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

export interface GraphRequestOptions {
  version?: GraphVersion;
  /** Extra OData query string (without leading "?"), e.g. "$select=id,state". */
  query?: string;
}

/** Thrown when a Graph request ultimately fails (after retries). */
export class GraphError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "GraphError";
  }

  /** True when the failure is a permission/consent problem. */
  get isAuthorization(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

interface GraphCollection<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GraphClient {
  private readonly getToken: () => Promise<string>;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: GraphClientOptions) {
    this.getToken = opts.getToken;
    this.baseUrl = opts.baseUrl ?? "https://graph.microsoft.com";
    this.fetchFn = opts.fetchFn ?? fetch;
    this.maxRetries = opts.maxRetries ?? 5;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private buildUrl(path: string, opts?: GraphRequestOptions): string {
    // Absolute URLs (e.g. an @odata.nextLink) are used verbatim.
    if (/^https?:\/\//i.test(path)) return path;
    const version = opts?.version ?? "v1.0";
    const clean = path.startsWith("/") ? path : `/${path}`;
    const query = opts?.query ? `?${opts.query}` : "";
    return `${this.baseUrl}/${version}${clean}${query}`;
  }

  /** Single GET returning the raw JSON body of type T. */
  async get<T>(path: string, opts?: GraphRequestOptions): Promise<T> {
    const url = this.buildUrl(path, opts);
    return this.fetchWithRetry<T>(url, path);
  }

  /**
   * GET a collection and follow every @odata.nextLink so ALL items are
   * returned, regardless of tenant size.
   */
  async getAll<T>(path: string, opts?: GraphRequestOptions): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined = this.buildUrl(path, opts);
    while (url) {
      const page: GraphCollection<T> = await this.fetchWithRetry<GraphCollection<T>>(url, path);
      if (Array.isArray(page.value)) items.push(...page.value);
      url = page["@odata.nextLink"];
    }
    return items;
  }

  private async fetchWithRetry<T>(url: string, path: string): Promise<T> {
    let attempt = 0;
    // Retries apply to 429 and 5xx only; other errors fail fast.
    for (;;) {
      const token = await this.getToken();
      const res = await this.fetchFn(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ConsistencyLevel: "eventual",
        },
      });

      if (res.ok) {
        // 204 No Content etc. — return an empty object rather than throwing.
        const text = await res.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      const retryable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = this.parseRetryAfter(res.headers.get("Retry-After"));
        const backoff = retryAfter ?? Math.min(2 ** attempt * 1000, 30_000);
        attempt += 1;
        await this.sleep(backoff);
        continue;
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const message = this.extractError(body) ?? `Graph request failed (${res.status})`;
      throw new GraphError(message, res.status, path, body);
    }
  }

  private parseRetryAfter(header: string | null): number | undefined {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
    return undefined;
  }

  private extractError(body: unknown): string | undefined {
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof (body.error as { message: unknown }).message === "string"
    ) {
      return (body.error as { message: string }).message;
    }
    return undefined;
  }
}
