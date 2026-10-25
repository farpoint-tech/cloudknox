import "./support/temp-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpResult } from "../src/http.js";
import { Hub } from "../src/hub.js";
import { m365AppChecks } from "../src/doctor.js";
import {
	AADSTS_HINTS,
	clearAppTokenCache,
	GRAPH_DEFAULT_SCOPE,
	M365_AUTH_ENV,
	M365_CLIENT_ID_ENV,
	M365_UPN_ENV,
	mapAadsts,
	normalizeAuth,
	normalizeClientId,
	normalizeUpn,
	requestAppToken,
	tokenRequest,
	tokenRoles,
	type Post,
	type SecretReader,
} from "../src/providers/m365app.js";
import {
	appCallOf,
	appConfigProblem,
	appSubscription,
	clearM365Cache,
	m365CallLog,
	M365_TENANT_ENV,
	REPORT_URLS,
	resolveM365Config,
	userUrl,
	type M365Config,
} from "../src/providers/m365copilot.js";
import { normalizeProviderSettings, tileFor } from "../src/render.js";
import { loadState, withState } from "../src/store.js";

const TENANT = "11111111-2222-3333-4444-555555555555";
const CLIENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const UPN = "philipp@contoso.com";
const SECRET = "fake-test-secret~not-real";
const NOW = Date.parse("2026-10-25T20:00:00Z");
const ok = (json: unknown): HttpResult => ({ kind: "ok", status: 200, json });
const http = (status: number, body = ""): HttpResult => ({ kind: "http", status, body });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (roles: string[]) => `${b64({ typ: "JWT", alg: "none" })}.${b64({ aud: "https://graph.microsoft.com", roles })}.sig`;
const ALL_ROLES = ["Reports.Read.All", "Organization.Read.All", "User.Read.All"];
const CFG: M365Config = { auth: "app", tenant: TENANT, clientId: CLIENT, upn: UPN };
const secretOk: SecretReader = async () => ({ status: "found", value: SECRET, source: "keychain" });

const LICENSES = { value: [{ skuPartNumber: "Microsoft_365_Copilot", skuId: "639dec6b-bb19-468b-871c-c5c441c4b0cb" }] };
const SUBSCRIPTIONS = { value: [{ skuPartNumber: "Microsoft_365_Copilot", nextLifecycleDateTime: "2026-12-15T00:00:00Z", totalLicenses: 5, status: "Enabled" }] };
const ROW = { reportRefreshDate: "2026-10-24", userPrincipalName: "Philipp@Contoso.com", lastActivityDate: "2026-10-24", microsoftTeamsCopilotLastActivityDate: "2026-10-24" };

function tokenPost(roles = ALL_ROLES, expiresIn = 3599): { post: Post; calls: { url: string; body: string; headers: Record<string, string> }[] } {
	const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
	const post: Post = async (url, body, headers) => {
		calls.push({ url, body, headers });
		return ok({ token_type: "Bearer", expires_in: expiresIn, access_token: jwt(roles) });
	};
	return { post, calls };
}

test("token request: URL per tenant, form body with client_credentials and Graph .default scope", () => {
	const r = tokenRequest(TENANT, CLIENT, SECRET);
	assert.equal(r.url, `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`);
	assert.deepEqual(r.headers, { "Content-Type": "application/x-www-form-urlencoded" });
	const b = new URLSearchParams(r.body);
	assert.deepEqual(Object.fromEntries(b), { client_id: CLIENT, client_secret: SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" });
	assert.equal(GRAPH_DEFAULT_SCOPE, "https://graph.microsoft.com/.default");
	// Special characters of a secret are form-encoded, not passed raw.
	assert.equal(new URLSearchParams(tokenRequest(TENANT, CLIENT, "a&b=c+d").body).get("client_secret"), "a&b=c+d");
});

test("token: cached until expires_in minus 5 min, then fetched again", async () => {
	clearAppTokenCache();
	const { post, calls } = tokenPost();
	const a = await requestAppToken(TENANT, CLIENT, SECRET, post, NOW);
	assert.equal(a.status, "found");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, tokenRequest(TENANT, CLIENT, SECRET).url);
	const b = await requestAppToken(TENANT, CLIENT, SECRET, post, NOW + 50 * 60_000);
	assert.equal(b.status === "found" && b.cached, true);
	assert.equal(calls.length, 1, "54 min token, 50 min later: still cached");
	await requestAppToken(TENANT, CLIENT, SECRET, post, NOW + 56 * 60_000);
	assert.equal(calls.length, 2, "within the last 5 min: new token");
	clearAppTokenCache();
	const short = tokenPost(ALL_ROLES, 200);
	await requestAppToken(TENANT, CLIENT, SECRET, short.post, NOW);
	await requestAppToken(TENANT, CLIENT, SECRET, short.post, NOW);
	assert.equal(short.calls.length, 2, "expires_in below the margin is not cached");
	clearAppTokenCache();
});

test("token errors: AADSTS codes → short German key text, full code in detail, never the secret or body", async () => {
	const cases: [string, string][] = [
		["AADSTS7000215", "Secret falsch"],
		["AADSTS700016", "App fehlt"],
		["AADSTS65001", "Consent fehlt"],
		["AADSTS500011", "Consent fehlt"],
		["AADSTS7000222", "Secret abgelaufen"],
	];
	for (const [code, hint] of cases) {
		clearAppTokenCache();
		const body = JSON.stringify({ error: "invalid_client", error_description: `${code}: something about client ${CLIENT} secret ${SECRET}` });
		const r = await requestAppToken(TENANT, CLIENT, SECRET, async () => http(code === "AADSTS700016" ? 400 : 401, body), NOW);
		assert.equal(r.status, "login", code);
		if (r.status !== "login") continue;
		assert.equal(r.hint, hint);
		assert.equal(r.detail, `${hint} (${code})`);
		assert.equal(r.code, code);
		assert.ok(!JSON.stringify(r).includes(SECRET), "secret never in the result");
		assert.ok(!JSON.stringify(r).includes("something about"), "response text is not passed on");
	}
	assert.deepEqual(mapAadsts(undefined), { hint: "Anmeldung", detail: "Anmeldung" });
	assert.deepEqual(mapAadsts("AADSTS90002"), { hint: "Anmeldung", detail: "Anmeldung (AADSTS90002)" });
	assert.equal(Object.keys(AADSTS_HINTS).length, 5);
	const off = await requestAppToken(TENANT, CLIENT, SECRET, async () => ({ kind: "offline", detail: "x" }), NOW);
	assert.equal(off.status, "offline");
	const busy = await requestAppToken(TENANT, CLIENT, SECRET, async () => ({ kind: "http", status: 429, body: "", retryAfter: "60" }), NOW);
	assert.equal(busy.status, "error");
	const garbage = await requestAppToken(TENANT, CLIENT, SECRET, async () => ok({ access_token: "nope" }), NOW);
	assert.equal(garbage.status, "error");
});

test("token roles claim decoded for the doctor (display only)", () => {
	assert.deepEqual(tokenRoles(jwt(["Reports.Read.All"])), ["Reports.Read.All"]);
	assert.deepEqual(tokenRoles("not.a.jwt"), []);
	assert.deepEqual(tokenRoles(""), []);
});

test("settings: GUID client ID, UPN shape, auth mode; flag-like and path-like values rejected", () => {
	assert.equal(normalizeClientId(` ${CLIENT.toUpperCase()} `), CLIENT);
	for (const bad of ["", "--client-id", "-x", "aaaa", `${CLIENT}x`, "../../etc", 7, undefined]) assert.equal(normalizeClientId(bad), undefined, String(bad));
	assert.equal(normalizeUpn(" Philipp.Schmidt+x@Contoso.com "), "philipp.schmidt+x@contoso.com");
	assert.equal(normalizeUpn("first_last@contoso.onmicrosoft.com"), "first_last@contoso.onmicrosoft.com");
	for (const bad of ["", "--upn", "-a@b.com", "philipp", "a@b", "a@@b.com", "a@b@c.com", "a b@c.com", "a/../b@c.com", "'a'@c.com", "a#b@c.com", "$x@c.com", "a@-c.com", "@c.com", 1]) {
		assert.equal(normalizeUpn(bad), undefined, String(bad));
	}
	assert.equal(normalizeAuth("app"), "app");
	assert.equal(normalizeAuth(" APP "), "app");
	for (const v of ["az", "", undefined, "--app", "cert", 1]) assert.equal(normalizeAuth(v), "az", String(v));
	const s = normalizeProviderSettings({ provider: "m365copilot", m365Auth: "app", tenantId: TENANT, clientId: CLIENT.toUpperCase(), upn: "Philipp@Contoso.com" });
	assert.deepEqual([s.m365Auth, s.clientId, s.upn], ["app", CLIENT, UPN]);
	const d = normalizeProviderSettings({});
	assert.deepEqual([d.m365Auth, d.clientId, d.upn], ["az", "", ""]);
});

test("config: app mode needs tenant, clientId and UPN, in that order; invalid ≠ missing", () => {
	assert.equal(appConfigProblem(CFG), undefined);
	assert.deepEqual(appConfigProblem({ auth: "app" })?.hint, "Tenant-ID");
	assert.match(appConfigProblem({ auth: "app", tenant: TENANT })!.detail, /clientId fehlt/);
	assert.match(appConfigProblem({ auth: "app", tenant: TENANT, clientIdRaw: "--x" })!.detail, /clientId ungültig/);
	assert.deepEqual(appConfigProblem({ auth: "app", tenant: TENANT, clientId: CLIENT, upnRaw: "-a@b.com" }), { detail: "UPN ungültig (name@domain erwartet)", hint: "UPN" });
});

test("config resolution: key settings (state.json) win over env; az stays default", async () => {
	const keys = [M365_AUTH_ENV, M365_CLIENT_ID_ENV, M365_UPN_ENV, M365_TENANT_ENV];
	const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
	try {
		for (const k of keys) delete process.env[k];
		await withState((s) => {
			delete s.m365Auth;
			delete s.m365ClientId;
			delete s.m365Upn;
			delete s.m365TenantId;
		});
		assert.deepEqual(await resolveM365Config(), { auth: "az" });
		process.env[M365_AUTH_ENV] = "app";
		process.env[M365_TENANT_ENV] = TENANT;
		process.env[M365_CLIENT_ID_ENV] = CLIENT;
		process.env[M365_UPN_ENV] = "--evil";
		assert.deepEqual(await resolveM365Config(), { auth: "app", tenant: TENANT, clientId: CLIENT, upnRaw: "--evil" });
		const hub = new Hub();
		await hub.setM365Config({ tenantId: TENANT, auth: "app", clientId: CLIENT.toUpperCase(), upn: "Philipp@Contoso.com" }, { refresh: false });
		const st = await loadState();
		assert.deepEqual([st.m365Auth, st.m365TenantId], ["app", TENANT]);
		assert.deepEqual(await resolveM365Config(), { auth: "app", tenant: TENANT, clientId: CLIENT, upn: UPN });
		await hub.setM365Config({ tenantId: TENANT, auth: "az" }, { refresh: false });
		assert.equal((await resolveM365Config()).auth, "az", "key setting az wins over env app");
		assert.equal(JSON.stringify(await loadState()).includes(SECRET), false);
	} finally {
		for (const k of keys) {
			if (prev[k] === undefined) delete process.env[k];
			else process.env[k] = prev[k];
		}
	}
});

/** Fake Graph: records URL + auth header; per-call overrides by app call name. */
function fakeGraph(over: Partial<Record<"license" | "user" | "subscriptions" | "report", HttpResult>> = {}) {
	const seen: { url: string; auth: string }[] = [];
	const get = async (url: string, headers: Record<string, string>): Promise<HttpResult> => {
		seen.push({ url, auth: headers.Authorization });
		const call = appCallOf(url);
		if (call && over[call]) return over[call]!;
		if (call === "license") return ok(LICENSES);
		if (call === "subscriptions") return ok(SUBSCRIPTIONS);
		if (call === "user") return ok({ userPrincipalName: "Philipp@Contoso.com", displayName: "Philipp" });
		if (call === "report") return ok({ value: [ROW] });
		return http(500);
	};
	return { get, seen };
}

test("app mode routing: /users/{upn}/licenseDetails, /users/{upn}, subscriptions, report; never /me", async () => {
	clearM365Cache();
	const { post, calls } = tokenPost();
	const g = fakeGraph();
	const sub = await appSubscription(CFG, { readSecret: secretOk, post, get: g.get });
	assert.equal(sub.status, "ok");
	assert.equal(sub.primary?.text, "ja");
	assert.equal(sub.resets?.[0]?.window, "Verlängerung");
	assert.deepEqual(sub.activity?.apps, ["Teams"]);
	const urls = g.seen.map((s) => s.url);
	assert.equal(urls[0], "https://graph.microsoft.com/v1.0/users/philipp%40contoso.com/licenseDetails?$select=skuPartNumber,skuId");
	assert.ok(urls.includes("https://graph.microsoft.com/v1.0/users/philipp%40contoso.com?$select=userPrincipalName,displayName"));
	assert.ok(urls.includes("https://graph.microsoft.com/v1.0/directory/subscriptions?$select=skuPartNumber,nextLifecycleDateTime,totalLicenses,status"));
	assert.ok(urls.includes(REPORT_URLS[0]));
	assert.ok(!urls.some((u) => u.includes("/me")), "app tokens have no /me");
	assert.ok(g.seen.every((s) => /^Bearer ey/.test(s.auth)));
	assert.equal(calls.length, 1);
	assert.deepEqual(Object.fromEntries(m365CallLog), { license: "ok", subscriptions: "ok", user: "ok", report: "ok" });
	assert.equal(userUrl("a+b@c.com", "/x"), "https://graph.microsoft.com/v1.0/users/a%2Bb%40c.com/x");
	assert.ok(!JSON.stringify(sub).includes(SECRET));
	clearM365Cache();
});

test("app mode statuses: secret missing, token AADSTS, Graph 403 names the permission, 404 = UPN", async () => {
	clearM365Cache();
	let posted = 0;
	const missing = await appSubscription(CFG, { readSecret: async () => ({ status: "missing" }), post: async () => (posted++, http(500)) });
	assert.deepEqual([missing.status, missing.hint], ["key_missing", "Secret fehlt"]);
	assert.match(missing.detail!, /m365-copilot-app/);
	assert.equal(posted, 0, "no token request without secret");

	const bad = await appSubscription(CFG, { readSecret: secretOk, post: async () => http(401, '{"error_description":"AADSTS7000215: Invalid client secret provided."}') });
	assert.deepEqual([bad.status, bad.hint, bad.detail], ["login", "Secret falsch", "Secret falsch (AADSTS7000215)"]);
	assert.equal(tileFor("m365copilot", { sub: bad }, "sub", NOW).bottom, "Secret falsch");

	const cfgMissing = await appSubscription({ auth: "app", tenant: TENANT, clientId: CLIENT }, { readSecret: secretOk });
	assert.deepEqual([cfgMissing.status, cfgMissing.hint], ["config", "UPN"]);
	assert.equal(tileFor("m365copilot", { sub: cfgMissing }, "sub", NOW).bottom, "UPN");

	clearM365Cache();
	const f = await appSubscription(CFG, { readSecret: secretOk, post: tokenPost().post, get: fakeGraph({ license: http(403) }).get });
	assert.deepEqual([f.status, f.hint, f.detail], ["login", "Recht fehlt", "Graph 403: User.Read.All fehlt (Admin-Consent)"]);
	assert.equal(tileFor("m365copilot", { sub: f }, "sub", NOW).bottom, "Recht fehlt", "no 'az login' hint in app mode");

	clearM365Cache();
	const nf = await appSubscription(CFG, { readSecret: secretOk, post: tokenPost().post, get: fakeGraph({ license: http(404) }).get });
	assert.deepEqual([nf.status, nf.hint], ["config", "UPN prüfen"]);

	clearM365Cache();
	const part = await appSubscription(CFG, { readSecret: secretOk, post: tokenPost().post, get: fakeGraph({ subscriptions: http(403), report: http(403) }).get });
	assert.equal(part.status, "ok");
	assert.equal(part.detail, "Verlängerung: Organization.Read.All fehlt; Nutzung: Reports.Read.All fehlt");
	clearM365Cache();
});

test("doctor app mode: keychain, token (missing roles named), each Graph call with permission on 403", async () => {
	clearM365Cache();
	const P = "m365copilot";
	const none = await m365AppChecks(CFG, { readSecret: async () => ({ status: "missing" }) });
	assert.deepEqual(none.find((c) => c.source === 'Keychain "m365-copilot-app"')?.result, "missing");
	assert.equal(none.some((c) => c.source.startsWith("POST")), false, "no token request without secret");

	const badTok = await m365AppChecks(CFG, { readSecret: secretOk, post: async () => http(400, '{"error_description":"AADSTS700016: Application not found"}') });
	assert.deepEqual(badTok.at(-1), { provider: P, source: "POST login.microsoftonline.com/…/oauth2/v2.0/token", result: "invalid", note: "App fehlt (AADSTS700016)" });

	clearM365Cache();
	const g = fakeGraph({ report: http(403) });
	const rows = await m365AppChecks(CFG, {
		readSecret: secretOk,
		post: tokenPost(["User.Read.All", "Organization.Read.All"]).post,
		fetchSub: () => appSubscription(CFG, { readSecret: secretOk, post: tokenPost().post, get: g.get }),
	});
	const by = (src: string) => rows.find((c) => c.source === src);
	assert.equal(by("POST login.microsoftonline.com/…/oauth2/v2.0/token")?.result, "warn");
	assert.match(by("POST login.microsoftonline.com/…/oauth2/v2.0/token")!.note!, /fehlt: Reports\.Read\.All/);
	assert.equal(by("GET graph /users/{upn}/licenseDetails")?.result, "ok");
	assert.equal(by("GET graph /users/{upn}")?.result, "ok");
	assert.equal(by("GET graph /directory/subscriptions")?.result, "ok");
	assert.deepEqual(by("GET graph Copilot-Nutzungsbericht D30"), { provider: P, source: "GET graph Copilot-Nutzungsbericht D30", result: "invalid", note: "HTTP 403: Reports.Read.All fehlt (Application, Admin-Consent)" });
	assert.ok(!JSON.stringify(rows).includes(SECRET));
	assert.ok(!JSON.stringify(rows).includes("eyJ"), "token never in doctor output");
	clearM365Cache();
});
