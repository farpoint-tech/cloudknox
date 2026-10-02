import { describe, expect, it, vi } from "vitest";
import { GraphClient, GraphError } from "./graphClient";

const token = async () => "test-token";
const noSleep = async () => {};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("GraphClient.getAll", () => {
  it("follows @odata.nextLink across all pages", async () => {
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("skiptoken=2")) {
        return jsonResponse({ value: [{ id: "c" }] });
      }
      if (u.endsWith("/users")) {
        return jsonResponse({
          value: [{ id: "a" }, { id: "b" }],
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/users?$skiptoken=2",
        });
      }
      throw new Error(`unexpected url ${u}`);
    });

    const client = new GraphClient({ getToken: token, fetchFn: fetchFn as unknown as typeof fetch });
    const items = await client.getAll<{ id: string }>("/users");

    expect(items.map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("GraphClient pathPrefix", () => {
  it("uses a fixed path prefix (e.g. Defender for Endpoint /api) instead of /v1.0", async () => {
    let calledUrl = "";
    const fetchFn = vi.fn(async (url: string | URL | Request) => {
      calledUrl = String(url);
      return jsonResponse({ value: [] });
    });
    const client = new GraphClient({
      getToken: token,
      baseUrl: "https://api.security.microsoft.com",
      pathPrefix: "/api",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await client.getAll("/machines");
    expect(calledUrl).toBe("https://api.security.microsoft.com/api/machines");
  });
});

describe("GraphClient retry", () => {
  it("retries on 429 honouring Retry-After then succeeds", async () => {
    let calls = 0;
    const fetchFn = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("", { status: 429, headers: { "Retry-After": "0" } });
      }
      return jsonResponse({ ok: true });
    });

    const client = new GraphClient({
      getToken: token,
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });
    const res = await client.get<{ ok: boolean }>("/me");

    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("throws GraphError on 403 without retrying", async () => {
    const fetchFn = vi.fn(async () =>
      jsonResponse({ error: { message: "Insufficient privileges" } }, { status: 403 }),
    );
    const client = new GraphClient({
      getToken: token,
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep: noSleep,
    });

    await expect(client.get("/policies")).rejects.toBeInstanceOf(GraphError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    try {
      await client.get("/policies");
    } catch (e) {
      expect(e).toBeInstanceOf(GraphError);
      expect((e as GraphError).isAuthorization).toBe(true);
      expect((e as GraphError).message).toContain("Insufficient privileges");
    }
  });
});
