import { describe, expect, it, vi } from "vitest";
import { GraphClient } from "../graph/graphClient";
import {
  assignOwner,
  categoryOf,
  escapeODataValue,
  isGuid,
  isMicrosoftOwned,
  listEnterpriseApps,
  resolveUserByUpn,
  NO_TAG_CATEGORY,
  type EnterpriseApp,
} from "./ownerService";

const token = async () => "test-token";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function makeApp(overrides: Partial<EnterpriseApp> = {}): EnterpriseApp {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    appId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    displayName: "Test App",
    tags: [],
    owners: [],
    ...overrides,
  };
}

describe("isGuid", () => {
  it("accepts a canonical guid", () => {
    expect(isGuid("11111111-2222-3333-4444-555555555555")).toBe(true);
  });
  it("rejects path-injection payloads", () => {
    expect(isGuid("11111111-2222-3333-4444-555555555555/appRoleAssignedTo?x=")).toBe(false);
    expect(isGuid("../users/abc")).toBe(false);
    expect(isGuid("")).toBe(false);
  });
});

describe("escapeODataValue", () => {
  it("doubles single quotes so the filter stays intact", () => {
    expect(escapeODataValue("o'connor@contoso.com")).toBe("o''connor@contoso.com");
    expect(escapeODataValue("x' or startsWith(a,'b")).toBe("x'' or startsWith(a,''b");
  });
});

describe("categoryOf", () => {
  it("uses the first tag, mirroring the PowerShell grouping", () => {
    expect(categoryOf({ tags: ["HR", "Finance"] })).toBe("HR");
    expect(categoryOf({ tags: [] })).toBe(NO_TAG_CATEGORY);
  });
});

describe("isMicrosoftOwned", () => {
  it("detects well-known Microsoft tenant ids case-insensitively", () => {
    expect(isMicrosoftOwned({ appOwnerOrganizationId: "F8CDEF31-A31E-4B4A-93E4-5F571E91255A" })).toBe(true);
    expect(isMicrosoftOwned({ appOwnerOrganizationId: "11111111-2222-3333-4444-555555555555" })).toBe(false);
    expect(isMicrosoftOwned({})).toBe(false);
  });
});

describe("listEnterpriseApps", () => {
  it("filters Microsoft-owned SPs and maps owners", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({
        value: [
          {
            id: "11111111-2222-3333-4444-555555555555",
            appId: "a1",
            displayName: "Third-party app",
            tags: ["HR"],
            appOwnerOrganizationId: "99999999-9999-9999-9999-999999999999",
            owners: [
              {
                id: "u1",
                displayName: "Jane",
                userPrincipalName: "jane@contoso.com",
                "@odata.type": "#microsoft.graph.user",
              },
            ],
          },
          {
            id: "22222222-2222-3333-4444-555555555555",
            appId: "a2",
            displayName: "Microsoft first-party",
            appOwnerOrganizationId: "f8cdef31-a31e-4b4a-93e4-5f571e91255a",
            owners: [],
          },
        ],
      }),
    );
    const graph = new GraphClient({ getToken: token, fetchFn: fetchFn as unknown as typeof fetch });

    const apps = await listEnterpriseApps(graph);

    expect(apps).toHaveLength(1);
    expect(apps[0].displayName).toBe("Third-party app");
    expect(apps[0].owners[0].userPrincipalName).toBe("jane@contoso.com");
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("servicePrincipalType eq 'Application'");
    expect(url).toContain("$expand=owners");
  });
});

describe("resolveUserByUpn", () => {
  it("escapes quotes in the UPN filter", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) => jsonResponse({ value: [] }));
    const graph = new GraphClient({ getToken: token, fetchFn: fetchFn as unknown as typeof fetch });

    await resolveUserByUpn(graph, "o'connor@contoso.com");

    const url = decodeURIComponent(String(fetchFn.mock.calls[0][0]));
    expect(url).toContain("o''connor@contoso.com");
  });
});

describe("assignOwner", () => {
  const owner = "aaaaaaaa-0000-0000-0000-000000000001";

  it("rejects a non-guid owner id outright", async () => {
    const graph = new GraphClient({ getToken: token, fetchFn: vi.fn() as unknown as typeof fetch });
    await expect(assignOwner(graph, [], "not-a-guid")).rejects.toThrow(/Invalid owner user id/);
  });

  it("skips apps that already have an owner and posts $ref for ownerless ones", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }));
    const graph = new GraphClient({ getToken: token, fetchFn: fetchFn as unknown as typeof fetch });

    const owned = makeApp({ owners: [{ id: "u1" }] });
    const ownerless = makeApp({ id: "33333333-2222-3333-4444-555555555555" });

    const results = await assignOwner(graph, [owned, ownerless], owner);

    expect(results.map((r) => r.status)).toEqual(["skipped-has-owner", "assigned"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toContain(`/servicePrincipals/${ownerless.id}/owners/$ref`);
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain(`/directoryObjects/${owner}`);
  });

  it("records per-app errors without aborting the batch", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request) =>
      jsonResponse({ error: { message: "denied" } }, { status: 403 }),
    );
    const graph = new GraphClient({ getToken: token, fetchFn: fetchFn as unknown as typeof fetch });

    const a = makeApp({ id: "44444444-2222-3333-4444-555555555555" });
    const b = makeApp({ id: "55555555-2222-3333-4444-555555555555" });

    const results = await assignOwner(graph, [a, b], owner);

    expect(results.map((r) => r.status)).toEqual(["error", "error"]);
    expect(results[0].message).toContain("denied");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
