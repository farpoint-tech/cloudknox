// Fixtures: shapes observed live with grok CLI 1.0.70 on 2026-10-25 (tokens, ids, names and e-mail replaced by placeholders).
import "./support/temp-user-home.js";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { test } from "node:test";
import { costAmount, costCli } from "../src/cost.js";
import { grokAuthCheck } from "../src/doctor.js";
import type { HttpResult } from "../src/http.js";
import { GROK_AUTH } from "../src/paths.js";
import { grokTier, mapGrokBilling, parseExpiry, parseGrokAuth, readGrokCred, usableGrokCred, type FormPost } from "../src/providers/grok.js";
import { tileFor } from "../src/render.js";

const ISSUER = "https://auth.x.ai";
const ENTRY_ID = `${ISSUER}::00000000-client-id`;
const entry = (extra: Record<string, unknown> = {}) => ({
	auth_mode: "oidc",
	key: "eyJ.placeholder.token",
	expires_at: "2026-10-26T04:24:58.479276Z",
	refresh_token: "refresh-placeholder",
	oidc_issuer: ISSUER,
	oidc_client_id: "00000000-client-id",
	principal_type: "User",
	principal_id: "p-1",
	user_id: "u-1",
	team_id: null,
	email: "user@example.invalid",
	first_name: "Vor",
	last_name: "Nach",
	create_time: "2026-10-25T10:00:00Z",
	coding_data_retention_opt_out: false,
	...extra,
});

const BILLING = {
	config: {
		currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", start: "2026-10-20T00:00:00+00:00", end: "2026-10-27T00:00:00+00:00" },
		onDemandCap: { val: 0 },
		onDemandUsed: { val: 0 },
		isUnifiedBillingUser: true,
		prepaidBalance: { val: 0 },
		topUpMethod: "TOP_UP_METHOD_SAVED_PAYMENT_METHOD",
		billingPeriodStart: "2026-10-20T00:00:00+00:00",
		billingPeriodEnd: "2026-10-27T00:00:00+00:00",
	},
};
const USER = { userId: "u-1", principalType: "User", teamId: null, organizationId: null, hasGrokCodeAccess: true, subscriptionTier: null };
const NOW = Date.parse("2026-10-25T21:30:00Z");

test("auth.json 1.0.70: token from `key`, ISO expiry with microseconds, issuer/client/refresh kept", () => {
	const c = parseGrokAuth(JSON.stringify({ [ENTRY_ID]: entry() }));
	assert.equal(c.status, "found");
	if (c.status !== "found") return;
	assert.deepEqual(
		[c.token, c.tokenField, c.entryId, c.expiresAt, c.authMode, c.issuer, c.clientId, c.refreshToken],
		["eyJ.placeholder.token", "key", ENTRY_ID, Date.parse("2026-10-26T04:24:58.479Z"), "oidc", ISSUER, "00000000-client-id", "refresh-placeholder"],
	);
});

test("auth.json: access_token / accessToken accepted, flat legacy file, latest expires_at wins", () => {
	const flat = parseGrokAuth(JSON.stringify({ access_token: "flat-token", expires_at: 1793519732 }));
	assert.equal(flat.status === "found" && [flat.token, flat.tokenField, flat.entryId, flat.expiresAt].join("|"), `flat-token|access_token||${1793519732 * 1000}`);
	const two = parseGrokAuth(
		JSON.stringify({
			old: { accessToken: "old-token", expires_at: "2026-10-20T00:00:00Z" },
			newer: { key: "new-token", expires_at: 1793519732000 },
			broken: { foo: 1 },
		}),
	);
	assert.equal(two.status === "found" && `${two.entryId}:${two.token}`, "newer:new-token");
	assert.equal(parseGrokAuth(JSON.stringify({ x: { email: "a" } })).status, "invalid");
	assert.equal(parseGrokAuth("nope").status, "invalid");
});

test("parseExpiry: epoch seconds, epoch ms, numeric string, ISO", () => {
	const ms = Date.parse("2026-10-26T04:24:58Z");
	assert.deepEqual([parseExpiry(ms / 1000), parseExpiry(ms), parseExpiry(String(ms / 1000)), parseExpiry("2026-10-26T04:24:58Z"), parseExpiry("")], [ms, ms, ms, ms, undefined]);
});

function stubPost(res: HttpResult) {
	const calls: { url: string; form: Record<string, string> }[] = [];
	const post: FormPost = async (url, form) => (calls.push({ url, form }), res);
	return { post, calls };
}

test("refresh: expired token is refreshed, write-back keeps unknown fields + other entries, mode 0600", async () => {
	const other = { auth_mode: "api_key", key: "other-key", custom: { nested: [1, 2] } };
	const original = { [ENTRY_ID]: entry({ expires_at: "2026-10-25T20:00:00Z", future_field: "keep" }), other, top_level_unknown: 7 };
	await fs.writeFile(GROK_AUTH, JSON.stringify(original, null, 2), { mode: 0o600 });
	const { post, calls } = stubPost({ kind: "ok", status: 200, json: { access_token: "eyJ.new", expires_in: 3600, refresh_token: "refresh-2", token_type: "Bearer" } });
	const c = await usableGrokCred({ post, now: NOW });
	assert.equal(c.status, "found");
	assert.equal(c.status === "found" && c.token, "eyJ.new");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, "https://auth.x.ai/oauth2/token");
	assert.deepEqual(calls[0].form, { grant_type: "refresh_token", client_id: "00000000-client-id", refresh_token: "refresh-placeholder" });
	const written = JSON.parse(await fs.readFile(GROK_AUTH, "utf8"));
	assert.deepEqual(written[ENTRY_ID], { ...original[ENTRY_ID], key: "eyJ.new", refresh_token: "refresh-2", expires_at: new Date(NOW + 3600_000).toISOString() });
	assert.deepEqual(written.other, other);
	assert.equal(written.top_level_unknown, 7);
	assert.equal((await fs.stat(GROK_AUTH)).mode & 0o777, 0o600);
	const dir = await fs.readdir(GROK_AUTH.replace(/auth\.json$/, ""));
	assert.deepEqual(dir, ["auth.json"], "no temp file left behind");
	const again = await readGrokCred();
	assert.equal(again.status === "found" && again.token, "eyJ.new");
});

test("refresh: failure leaves auth.json untouched and reports login with grok login", async () => {
	const before = JSON.stringify({ [ENTRY_ID]: entry({ expires_at: "2026-10-25T20:00:00Z" }) });
	await fs.writeFile(GROK_AUTH, before, { mode: 0o600 });
	const { post } = stubPost({ kind: "http", status: 400, body: '{"error":"invalid_grant"}' });
	const c = await usableGrokCred({ post, now: NOW });
	assert.equal(c.status, "login");
	assert.match(c.status === "login" ? c.detail : "", /Refresh HTTP 400.*grok login/);
	assert.equal(await fs.readFile(GROK_AUTH, "utf8"), before);
	const noRefresh = await (async () => {
		await fs.writeFile(GROK_AUTH, JSON.stringify({ [ENTRY_ID]: entry({ expires_at: "2026-10-25T20:00:00Z", refresh_token: undefined }) }));
		return usableGrokCred({ post, now: NOW });
	})();
	assert.equal(noRefresh.status, "login");
});

test("refresh: valid token is used as is, no POST", async () => {
	await fs.writeFile(GROK_AUTH, JSON.stringify({ [ENTRY_ID]: entry() }), { mode: 0o600 });
	const { post, calls } = stubPost({ kind: "offline", detail: "x" });
	const c = await usableGrokCred({ post, now: NOW });
	assert.equal(c.status === "found" && c.token, "eyJ.placeholder.token");
	assert.equal(calls.length, 0);
});

test("billing cap 0 (live shape): weekly window without percent, cost 0 $, reset Woche", () => {
	const m = mapGrokBilling(BILLING)!;
	assert.deepEqual(m.primary, { label: "Wo", pct: 0, text: "o. Limit", resetAt: "2026-10-27T00:00:00.000Z" });
	assert.equal(m.detail, "Woche · kein Limit sichtbar");
	assert.deepEqual(m.resets, [{ provider: "grok", window: "Woche", resetsAt: "2026-10-27T00:00:00.000Z" }]);
	assert.equal(m.cost.length, 1);
	assert.equal(costAmount(m.cost[0]), "0 $");
	assert.equal(costCli(m.cost[0], NOW), "On-Demand 0 $ (Cap 0)");
});

test("billing cap > 0: percent from onDemandUsed/onDemandCap, cost On-Demand used/cap $", () => {
	const m = mapGrokBilling({ config: { ...BILLING.config, onDemandCap: { val: 5000 }, onDemandUsed: { val: "1250" } } })!;
	assert.equal(m.primary.pct, 25);
	assert.equal(m.primary.text, undefined);
	assert.equal(m.detail, undefined);
	assert.equal(m.resets[0].pct, 25);
	assert.equal(costAmount(m.cost[0]), "12,50 / 50 $");
	assert.equal(m.cost[0].label, "On-Demand");
	const prepaid = mapGrokBilling({ config: { ...BILLING.config, prepaidBalance: { val: 2000 } } })!;
	assert.deepEqual(prepaid.cost.map((c) => `${c.label} ${costAmount(c)}`), ["Guthaben 20 $"]);
});

test("billing creditUsagePercent wins over on-demand ratio; monthly period type", () => {
	const m = mapGrokBilling({
		config: { ...BILLING.config, creditUsagePercent: 42, onDemandCap: { val: 100 }, onDemandUsed: { val: 100 }, currentPeriod: { type: "USAGE_PERIOD_TYPE_MONTHLY", end: "2026-11-01T00:00:00Z" } },
	})!;
	assert.equal(m.primary.pct, 42);
	assert.equal(m.primary.label, "Mo");
	assert.equal(m.resets[0].window, "Monat");
	assert.equal(mapGrokBilling({ creditUsagePercent: 7, currentPeriod: { end: "2026-11-01T00:00:00Z" } })!.primary.pct, 7, "flat shape without config");
	assert.equal(mapGrokBilling({ config: {} }), undefined);
});

test("tier: subscriptionTier, subscriptions[0] name/tier/plan, none", () => {
	assert.equal(grokTier(USER, { subscriptions: [] }), undefined);
	assert.equal(grokTier(USER, { subscriptions: [{ tier: "SUPERGROK" }] }), "SUPERGROK");
	assert.equal(grokTier(USER, { subscriptions: [{ name: "SuperGrok Heavy", plan: "x" }] }), "SuperGrok Heavy");
	assert.equal(grokTier({ ...USER, subscriptionTier: "SUPERGROK_PRO" }, { subscriptions: [{ name: "x" }] }), "SUPERGROK_PRO");
	assert.equal(grokTier(undefined, undefined), undefined);
});

test("tile: no subscription shows the week and 'kein Abo', never login; login shows 'grok login'", () => {
	const m = mapGrokBilling(BILLING)!;
	const t = tileFor("grok", { sub: { status: "ok", primary: m.primary, plan: "kein Abo", cost: m.cost, resets: m.resets, fetchedAt: "2026-10-25T21:29:00Z" } }, "sub", NOW);
	assert.deepEqual([t.big, t.small, t.barPct, t.bottom, t.dim], ["Wo o. Limit", "kein Abo", undefined, "↻ 26h30", false]);
	const k = tileFor("grok", { sub: { status: "ok", primary: m.primary, plan: "kein Abo", cost: m.cost, fetchedAt: "" } }, "kosten", NOW);
	assert.equal(k.big, "0 $");
	const login = tileFor("grok", { sub: { status: "login", hint: "grok login", fetchedAt: "" } }, "sub", NOW);
	assert.deepEqual([login.big, login.bottom], ["login", "grok login"]);
});

test("doctor auth row: mode and expiry, never e-mail or token", () => {
	const c = parseGrokAuth(JSON.stringify({ [ENTRY_ID]: entry() }));
	const row = grokAuthCheck(c, NOW);
	assert.equal(row.result, "found");
	assert.equal(row.note, "Modus oidc, gültig bis 2026-10-26 04:24 UTC (noch 415 min)");
	assert.doesNotMatch(JSON.stringify(row), /example\.invalid|eyJ|refresh-placeholder/);
	const expired = grokAuthCheck(c, Date.parse("2026-10-27T00:00:00Z"));
	assert.match(expired.note!, /abgelaufen seit .* Refresh beim nächsten Abruf/);
});
