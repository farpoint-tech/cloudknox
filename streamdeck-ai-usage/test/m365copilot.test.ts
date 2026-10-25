import "./support/temp-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpResult } from "../src/http.js";
import { Hub } from "../src/hub.js";
import {
	activityFromRow,
	azLoginHint,
	buildM365Sub,
	copilotRenewal,
	copilotSkus,
	m365copilot,
	M365_TENANT_ENV,
	normalizeTenant,
	readAzGraphToken,
	REPORT_URLS,
	reportActivity,
	resolveTenant,
	type Runner,
} from "../src/providers/m365copilot.js";
import { overviewCost, overviewValue, svgResets, tileFor } from "../src/render.js";
import { costNotable } from "../src/cost.js";
import { withState, loadState } from "../src/store.js";
import { applyResult } from "../src/subgate.js";

const TENANT = "11111111-2222-3333-4444-555555555555";
const NOW = Date.parse("2026-10-25T20:00:00Z");
const ok = (json: unknown): HttpResult => ({ kind: "ok", status: 200, json });
const http = (status: number): HttpResult => ({ kind: "http", status, body: "" });

// Shapes as documented on Microsoft Learn (licenseDetails, companySubscription, report JSON of the beta reportRoot).
const LICENSES = {
	value: [
		{ skuPartNumber: "SPE_E5", skuId: "06ebc4ee-1bb5-47dd-8120-11324bc54e06" },
		{ skuPartNumber: "Microsoft_365_Copilot", skuId: "639dec6b-bb19-468b-871c-c5c441c4b0cb" },
	],
};
const NO_COPILOT = { value: [{ skuPartNumber: "SPE_E5", skuId: "x" }] };
const SUBSCRIPTIONS = {
	value: [
		{ skuPartNumber: "SPE_E5", nextLifecycleDateTime: "2026-11-30T00:00:00Z", totalLicenses: 50, status: "Enabled" },
		{ skuPartNumber: "Microsoft_365_Copilot", nextLifecycleDateTime: "2027-03-01T00:00:00Z", totalLicenses: 10, status: "Enabled" },
		{ skuPartNumber: "Microsoft_365_Copilot", nextLifecycleDateTime: "2026-12-15T00:00:00Z", totalLicenses: 5, status: "Enabled" },
		{ skuPartNumber: "Microsoft_365_Copilot", nextLifecycleDateTime: "2026-01-01T00:00:00Z", totalLicenses: 0, status: "Deleted" },
	],
};
const ROW = {
	reportRefreshDate: "2026-10-24",
	userPrincipalName: "Philipp@Contoso.com",
	displayName: "Philipp",
	lastActivityDate: "2026-10-24",
	copilotChatLastActivityDate: "",
	microsoftTeamsCopilotLastActivityDate: "2026-10-24",
	wordCopilotLastActivityDate: "2026-10-02",
	excelCopilotLastActivityDate: "2026-08-01", // older than 30 days → not active
	powerPointCopilotLastActivityDate: "",
	outlookCopilotLastActivityDate: "2026-09-25",
	oneNoteCopilotLastActivityDate: "",
	loopCopilotLastActivityDate: "",
	copilotActivityUserDetailsByPeriod: [{ reportPeriod: 30 }],
};

test("tenant: GUID or domain, lowercased; anything else (incl. flag-like) rejected", () => {
	assert.equal(normalizeTenant(` ${TENANT.toUpperCase()} `), TENANT);
	assert.equal(normalizeTenant("Contoso.onmicrosoft.com"), "contoso.onmicrosoft.com");
	for (const bad of ["", "--help", "contoso", "a b.com", 42, undefined, "x;rm.com"]) assert.equal(normalizeTenant(bad), undefined, String(bad));
});

test("az token: args, found / missing / login (AADSTS code only) / timeout / garbage", async () => {
	let seen: string[] = [];
	const run = (r: Awaited<ReturnType<Runner>>): Runner => async (file, args, timeoutMs) => {
		assert.equal(file, "az");
		assert.equal(timeoutMs, 20_000);
		seen = args;
		return r;
	};
	const jwt = "eyJ0eXAiOiJKV1QifQ.eyJhdWQiOiJncmFwaCJ9.c2ln";
	assert.deepEqual(await readAzGraphToken(TENANT, run({ ok: true, stdout: jwt + "\n", stderr: "" })), { status: "found", token: jwt });
	assert.deepEqual(seen, ["account", "get-access-token", "--tenant", TENANT, "--resource-type", "ms-graph", "--query", "accessToken", "-o", "tsv"]);
	assert.equal((await readAzGraphToken(TENANT, run({ ok: false, stdout: "", stderr: "", code: "ENOENT" }))).status, "missing");
	const login = await readAzGraphToken(TENANT, run({ ok: false, stdout: "", stderr: "ERROR: AADSTS70043: The refresh token has expired secret=abc", code: 1 }));
	assert.deepEqual(login, { status: "login", detail: `${azLoginHint(TENANT)} (AADSTS70043)` });
	assert.ok(!JSON.stringify(login).includes("secret"), "stderr text is not passed on");
	assert.equal((await readAzGraphToken(TENANT, run({ ok: false, stdout: "", stderr: "", timedOut: true }))).status, "error");
	assert.equal((await readAzGraphToken(TENANT, run({ ok: true, stdout: "not a token", stderr: "" }))).status, "error");
	assert.equal(azLoginHint(TENANT), `az login --tenant ${TENANT} --scope https://graph.microsoft.com//.default`);
});

test("license detection: any skuPartNumber containing COPILOT", () => {
	assert.deepEqual(copilotSkus(LICENSES), ["Microsoft_365_Copilot"]);
	assert.deepEqual(copilotSkus(NO_COPILOT), []);
	assert.deepEqual(copilotSkus({ value: [{ skuPartNumber: "microsoft_copilot_for_sales" }] }), ["microsoft_copilot_for_sales"]);
	assert.deepEqual(copilotSkus({}), []);
});

test("renewal: soonest future date of enabled Copilot subscriptions, license count summed", () => {
	const r = copilotRenewal(SUBSCRIPTIONS, ["Microsoft_365_Copilot"], NOW);
	assert.equal(r.resetsAt, "2026-12-15T00:00:00.000Z");
	assert.equal(r.licenses, 15);
	assert.deepEqual(r.skus, ["Microsoft_365_Copilot"]);
	assert.deepEqual(copilotRenewal({ value: [{ skuPartNumber: "SPE_E5", totalLicenses: 3 }] }, [], NOW), { skus: [] });
});

test("sub: happy path → Lizenz ja, renewal as ResetEvent 'Verlängerung', license count as info cost", () => {
	const s = buildM365Sub({ license: ok(LICENSES), subscriptions: ok(SUBSCRIPTIONS), activity: activityFromRow(ROW, NOW) }, TENANT, "2026-10-25T20:00:00Z", NOW);
	assert.equal(s.status, "ok");
	assert.deepEqual(s.primary, { label: "Lizenz", pct: 0, text: "ja", resetAt: "2026-12-15T00:00:00.000Z" });
	assert.equal(s.plan, "Microsoft_365_Copilot");
	assert.deepEqual(s.resets, [{ provider: "m365copilot", window: "Verlängerung", resetsAt: "2026-12-15T00:00:00.000Z" }]);
	assert.deepEqual(s.cost, [{ label: "Lizenz", used: 15, info: true, resetAt: "2026-12-15T00:00:00.000Z" }]);
	assert.equal(costNotable(s.cost![0]), false, "license count never drives the overview cost row");
	assert.equal(s.detail, undefined);
	// The gate stores it as good value (needs status ok + primary).
	assert.equal(applyResult(undefined, undefined, s, NOW).lastGood?.primary?.text, "ja");
});

test("sub: no Copilot SKU → Lizenz nein; subscriptions 403 quiet with detail; usage 403 keeps license status", () => {
	const s = buildM365Sub({ license: ok(NO_COPILOT), subscriptions: http(403), activity: { status: "forbidden", apps: [], detail: "Nutzung: keine Berechtigung" } }, TENANT);
	assert.equal(s.status, "ok");
	assert.equal(s.primary?.text, "nein");
	assert.deepEqual(s.resets, []);
	assert.equal(s.cost, undefined, "no count → Kosten n/v");
	assert.equal(s.detail, "Verlängerung: keine Berechtigung; Nutzung: keine Berechtigung");
});

test("sub: license call 401/403 → login with az login hint; 429 passed on for the gate", () => {
	assert.deepEqual(
		{ status: buildM365Sub({ license: http(401) }, TENANT).status, detail: buildM365Sub({ license: http(403) }, TENANT).detail },
		{ status: "login", detail: azLoginHint(TENANT) },
	);
	assert.equal(buildM365Sub({ license: { kind: "http", status: 429, body: "", retryAfter: "30" } }, TENANT).httpCode, 429);
});

test("report row: apps active within 30 days before reportRefreshDate, last activity date", () => {
	assert.deepEqual(activityFromRow(ROW, NOW), { status: "ok", apps: ["Teams", "Word", "Outlook"], lastActivity: "2026-10-24", refreshDate: "2026-10-24" });
	assert.deepEqual(activityFromRow({ ...ROW, microsoftTeamsCopilotLastActivityDate: "", wordCopilotLastActivityDate: "", outlookCopilotLastActivityDate: "" }, NOW).apps, []);
});

test("report: UPN match (case-insensitive) across pages; foreign nextLink not followed", async () => {
	const calls: string[] = [];
	const page2 = `https://graph.microsoft.com/beta/reports/next?$skiptoken=2`;
	const get = async (url: string): Promise<HttpResult> => {
		calls.push(url);
		if (url === REPORT_URLS[0]) return ok({ value: [{ ...ROW, userPrincipalName: "other@contoso.com" }], "@odata.nextLink": page2 });
		if (url === page2) return ok({ value: [ROW] });
		return http(500);
	};
	const a = await reportActivity(get, "philipp@contoso.com", NOW);
	assert.deepEqual(a.apps, ["Teams", "Word", "Outlook"]);
	assert.deepEqual(calls, [REPORT_URLS[0], page2]);

	const evil = await reportActivity(async () => ok({ value: [], "@odata.nextLink": "https://evil.example/steal" }), "x@y.com", NOW);
	assert.equal(evil.status, "none");
});

test("report: 403 → forbidden ('Nutzung: keine Berechtigung'); v1.0 404 falls back to beta; concealed names", async () => {
	const f = await reportActivity(async () => http(403), "a@b.com", NOW);
	assert.deepEqual(f, { status: "forbidden", apps: [], detail: "Nutzung: keine Berechtigung" });

	const urls: string[] = [];
	const fb = await reportActivity(async (u) => (urls.push(u), u === REPORT_URLS[0] ? http(404) : ok({ value: [ROW] })), "philipp@contoso.com", NOW);
	assert.equal(fb.status, "ok");
	assert.deepEqual(urls, REPORT_URLS);

	const hidden = await reportActivity(async () => ok({ value: [{ ...ROW, userPrincipalName: "DC8C64D6EC3A3AA17481D7E5EB5B68A6" }] }), "philipp@contoso.com", NOW);
	assert.equal(hidden.status, "concealed");
	assert.equal((await reportActivity(async () => ok({ value: [] }), "a@b.com", NOW)).status, "none");
});

test("render: license tile, activity tile, login hint, overview without bar, resets key name fits", () => {
	const sub = buildM365Sub({ license: ok(LICENSES), subscriptions: ok(SUBSCRIPTIONS), activity: activityFromRow(ROW, NOW) }, TENANT, new Date(NOW).toISOString(), NOW);
	const t = tileFor("m365copilot", { sub }, "sub", NOW);
	assert.equal(t.title, "M365 COPILOT");
	assert.equal(t.big, "Lizenz ja");
	assert.equal(t.small, "M365 Copilot");
	assert.equal(t.barPct, undefined);
	assert.match(t.bottom, /^↻ 50d/);
	const a = tileFor("m365copilot", { sub }, "tokens", NOW);
	assert.deepEqual([a.big, a.small, a.bottom], ["3 Apps", "Teams, Word, Out…", "zuletzt 24.10."]);
	const forb = tileFor("m365copilot", { sub: { ...sub, activity: { status: "forbidden", apps: [] } } }, "tokens", NOW);
	assert.deepEqual([forb.big, forb.bottom], ["n/v", "k. Berechtigung"]);
	const login = tileFor("m365copilot", { sub: { status: "login", detail: azLoginHint(TENANT), fetchedAt: "x" } }, "sub", NOW);
	assert.deepEqual([login.big, login.bottom], ["login", "az login"]);
	assert.equal(tileFor("m365copilot", { sub: { status: "config", fetchedAt: "x" } }, "auto", NOW).bottom, "Tenant-ID");
	assert.deepEqual(overviewValue({ sub }), { text: "ja", dim: false });
	assert.equal(overviewCost(new Map([["m365copilot", { sub }]])), undefined);
	assert.equal(tileFor("copilot", {}, "sub", NOW).title, "GH COPILOT");
	const svg = svgResets({ shown: sub.resets!, hidden: 0, alt: false, muted: false }, NOW);
	assert.match(svg, />M365 Verlängerung</);
});

test("tenant: key setting (state.json) wins over env; missing → status config, no az call", async () => {
	const prev = process.env[M365_TENANT_ENV];
	delete process.env[M365_TENANT_ENV];
	try {
		assert.deepEqual(await resolveTenant(), {});
		const none = (await m365copilot.subscription()).sub!;
		assert.equal(none.status, "config");
		assert.match(none.detail!, /tenantId fehlt/);
		process.env[M365_TENANT_ENV] = "contoso.onmicrosoft.com";
		assert.deepEqual(await resolveTenant(), { tenant: "contoso.onmicrosoft.com" });
		process.env[M365_TENANT_ENV] = "--evil";
		assert.deepEqual(await resolveTenant(), { raw: "--evil" });
		assert.match((await m365copilot.subscription()).sub!.detail!, /ungültig/);

		await withState((s) => {
			s.lastSub.m365copilot = { status: "ok", primary: { label: "Lizenz", pct: 0, text: "ja" }, fetchedAt: new Date().toISOString() };
			s.subGate.m365copilot = { kind: "429", strikes: 1, cooldownUntil: Date.now() + 3600_000 };
		});
		const hub = new Hub();
		await hub.setM365Tenant("not a tenant");
		assert.ok((await loadState()).lastSub.m365copilot, "invalid value is ignored");
		await hub.setM365Tenant(TENANT.toUpperCase(), { refresh: false }); // no az call in tests
		const st = await loadState();
		assert.equal(st.m365TenantId, TENANT);
		assert.equal(st.subGate.m365copilot, undefined, "cooldown of the old tenant dropped");
		assert.deepEqual(await resolveTenant(), { tenant: TENANT }, "setting wins over env");
	} finally {
		if (prev === undefined) delete process.env[M365_TENANT_ENV];
		else process.env[M365_TENANT_ENV] = prev;
	}
});
