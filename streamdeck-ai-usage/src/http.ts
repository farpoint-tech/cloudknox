export type HttpResult =
	| { kind: "ok"; status: number; json: unknown }
	| { kind: "http"; status: number; body: string; retryAfter?: string }
	| { kind: "offline"; detail: string };

/** fetch with timeout; never throws, never logs request headers. */
export async function getJson(
	url: string,
	headers: Record<string, string>,
	init: { method?: string; body?: string; timeoutMs?: number } = {},
): Promise<HttpResult> {
	try {
		const res = await fetch(url, {
			method: init.method ?? "GET",
			headers: { "User-Agent": "ai-usage-deck/1.0", Accept: "application/json", ...headers },
			body: init.body,
			signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
		});
		const text = await res.text();
		if (!res.ok) return { kind: "http", status: res.status, body: text.slice(0, 300), retryAfter: res.headers.get("retry-after") ?? undefined };
		try {
			return { kind: "ok", status: res.status, json: JSON.parse(text) };
		} catch {
			return { kind: "http", status: res.status, body: "invalid JSON" };
		}
	} catch (e) {
		return { kind: "offline", detail: e instanceof Error ? e.name + ": " + e.message : String(e) };
	}
}

/** Safe nested property access for untyped JSON. */
export function pick(obj: unknown, ...keys: (string | number)[]): unknown {
	let cur: unknown = obj;
	for (const k of keys) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string | number, unknown>)[k];
	}
	return cur;
}

export function num(v: unknown): number | undefined {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
	return undefined;
}

/**
 * Retry-After header as milliseconds from `now`: delta-seconds ("120") or an HTTP date.
 * Returns undefined for a missing or unparsable value; past dates give 0.
 */
export function parseRetryAfter(v: string | null | undefined, now = Date.now()): number | undefined {
	if (v === null || v === undefined) return undefined;
	const t = v.trim();
	if (t === "") return undefined;
	if (/^\d+$/.test(t)) return Number(t) * 1000;
	const d = Date.parse(t);
	if (!Number.isFinite(d)) return undefined;
	return Math.max(0, d - now);
}
