// Fixtures: shapes of the live responses of 2026-10-25 (values kept, ids/emails left out).
import "./support/temp-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { costAmount, costCli, costLabel, fmtNum, primaryCost } from "../src/cost.js";
import { Hub } from "../src/hub.js";
import { claudeBudgets, claudeCost, claudeResets } from "../src/providers/claude.js";
import { codexCost } from "../src/providers/codex.js";
import { copilotCost } from "../src/providers/copilot.js";
import { PROVIDERS } from "../src/providers/index.js";
import type { SubPart } from "../src/providers/types.js";
import { metricsFor, normalizeProviderSettings, overviewCost, svgOverview, tileFor } from "../src/render.js";
import { applyResult, staleFrom } from "../src/subgate.js";

const NOW = Date.parse("2026-10-25T21:30:00Z");

const CLAUDE = {
	five_hour: { utilization: 13, resets_at: "2026-10-26T01:59:59.772830+00:00", limit_dollars: null, used_dollars: null, remaining_dollars: null, locked_reason: null },
	seven_day: { utilization: 10, resets_at: "2026-10-31T23:59:59.772851+00:00", limit_dollars: null, used_dollars: null, remaining_dollars: null, locked_reason: null },
	seven_day_opus: null,
	tangelo: null,
	iguana_necktie: { utilization: 100, resets_at: "2026-11-05T07:59:00+00:00", limit_dollars: 250, used_dollars: 251.205606, remaining_dollars: 0, locked_reason: null },
	extra_usage: {
		is_enabled: false,
		monthly_limit: 2500,
		used_credits: 0,
		utilization: 0,
		currency: "EUR",
		decimal_places: 2,
		disabled_reason: "out_of_credits",
		user_disabled: false,
		spend_limit_reached: false,
		credits_ever_enabled: true,
		daily: null,
		weekly: null,
	},
	limits: [{ kind: "session", resets_at: "2026-10-26T01:59:59.772830+00:00", limit_dollars: 999 }],
	spend: { used: { amount_minor: 0, currency: "EUR", exponent: 2 }, limit: { amount_minor: 2500, currency: "EUR", exponent: 2 } },
};

const CODEX = {
	plan_type: "pro",
	credits: { has_credits: false, unlimited: false, overage_limit_reached: false, balance: "0", approx_local_messages: [0, 0] },
	spend_control: { reached: false, individual_limit: null },
	rate_limit_reset_credits: { available_count: 0, applicable_available_count: 0 },
	rate_limit: { primary_window: { used_percent: 3, limit_window_seconds: 604800, reset_at: 1793519732 }, secondary_window: null },
};

const COPILOT = {
	copilot_plan: "individual",
	quota_reset_date: "2026-11-01",
	quota_snapshots: {
		chat: { overage_count: 0, overage_permitted: false, percent_remaining: 99, unlimited: false, entitlement: 200 },
		premium_interactions: { overage_count: 0, overage_permitted: false, percent_remaining: 0, unlimited: false, entitlement: 0 },
	},
};

test("fmtNum: German grouping, decimals only below 100", () => {
	assert.deepEqual([fmtNum(2500), fmtNum(25), fmtNum(0), fmtNum(251.205606), fmtNum(12.4), fmtNum(1234567)], ["2.500", "25", "0", "251", "12,40", "1.234.567"]);
});

test("claude extra_usage: minor units scaled by decimal_places, disabled → 'Extra aus'", () => {
	const [extra] = claudeCost(CLAUDE);
	assert.equal(extra.label, "Extra");
	assert.deepEqual([extra.used, extra.limit, extra.currency, extra.state, extra.note, extra.reached], [0, 25, "EUR", "aus", "out_of_credits", false]);
	assert.equal(costAmount(extra), "0 / 25 €");
	assert.equal(costLabel(extra), "Extra aus");
	// Without decimal_places the amount is taken as is.
	const raw = claudeCost({ extra_usage: { is_enabled: true, monthly_limit: 2500, used_credits: 120, utilization: 4.8, currency: "EUR" } })[0];
	assert.deepEqual([costAmount(raw), costLabel(raw)], ["120 / 2.500 €", "Extra 5%"]);
	const hit = claudeCost({ extra_usage: { ...CLAUDE.extra_usage, is_enabled: true, spend_limit_reached: true } })[0];
	assert.deepEqual([hit.state, hit.reached], ["Limit erreicht", true]);
});

test("claude budgets: any top-level object with limit_dollars > 0, key name not hard-coded", () => {
	const b = claudeBudgets(CLAUDE);
	assert.equal(b.length, 1, "five_hour/seven_day (limit null), null keys, arrays and objects without limit_dollars skipped");
	assert.deepEqual(
		{ ...b[0] },
		{ label: "Budget", used: 251.205606, limit: 250, currency: "USD", pct: 100, resetAt: "2026-11-05T07:59:00.000Z", reached: true },
	);
	assert.equal(costAmount(b[0]), "251 / 250 $");
	assert.equal(costLabel(b[0]), "Budget 100%");
	// Renamed key, under limit, no utilization → computed.
	const renamed = claudeBudgets({ copper_kite: { limit_dollars: "100", used_dollars: 40, remaining_dollars: 60, resets_at: null }, zero: { limit_dollars: 0, used_dollars: 5 } });
	assert.deepEqual(renamed.map((x) => [x.used, x.limit, x.pct, x.reached, x.resetAt]), [[40, 100, 40, false, undefined]]);
	assert.deepEqual(claudeBudgets(null), []);
	assert.deepEqual(claudeCost(CLAUDE).map((c) => c.label), ["Extra", "Budget"]);
});

test("claude budget reset becomes a ResetEvent 'Budget'", () => {
	const r = claudeResets(CLAUDE);
	assert.deepEqual(
		r.map((e) => [e.window, e.resetsAt, e.pct]),
		[
			["5h", "2026-10-26T01:59:59.772Z", 13],
			["Woche", "2026-10-31T23:59:59.772Z", 10],
			["Budget", "2026-11-05T07:59:00.000Z", 100],
		],
	);
});

test("codex credits: 'Credits 0', unlimited, limit reached, reset credits only when > 0", () => {
	const [c, ...rest] = codexCost(CODEX);
	assert.deepEqual([c.label, c.used, c.limit, c.state, c.reached, rest.length], ["Credits", 0, undefined, undefined, false, 0]);
	assert.equal(costCli(c), "Credits 0");
	const unl = codexCost({ ...CODEX, credits: { ...CODEX.credits, unlimited: true } })[0];
	assert.deepEqual([costAmount(unl), costLabel(unl)], ["∞", "Credits unbegrenzt"]);
	const reached = codexCost({ ...CODEX, spend_control: { reached: true, individual_limit: 50 } })[0];
	assert.deepEqual([reached.state, reached.reached, costAmount(reached)], ["Limit erreicht", true, "0 / 50"]);
	const over = codexCost({ ...CODEX, credits: { ...CODEX.credits, overage_limit_reached: true } })[0];
	assert.equal(over.state, "Limit erreicht");
	const rc = codexCost({ ...CODEX, rate_limit_reset_credits: { available_count: 2 } });
	assert.deepEqual(rc.map((x) => [x.label, x.used]), [["Credits", 0], ["Reset-Credits", 2]]);
	assert.deepEqual(codexCost({ plan_type: "free" }), []);
});

test("copilot overage: premium overage_count, not permitted → 'Overage aus'", () => {
	const [o] = copilotCost(COPILOT);
	assert.deepEqual([o.label, o.used, o.state], ["Overage", 0, "aus"]);
	assert.deepEqual([costAmount(o), costLabel(o)], ["0", "Overage aus"]);
	const used = copilotCost({ quota_snapshots: { premium_interactions: { overage_count: 7, overage_permitted: true } } })[0];
	assert.deepEqual([costAmount(used), costLabel(used), used.state], ["7", "Overage", undefined]);
	assert.deepEqual(copilotCost({ quota_snapshots: {} }), []);
});

const sub = (extra: Partial<SubPart>): SubPart => ({ status: "ok", primary: { label: "5h", pct: 13 }, fetchedAt: "2026-10-25T21:29:00Z", ...extra });

test("Kosten tile: reached item first, amount big, label small, bar from utilization, reset bottom", () => {
	const t = tileFor("claude", { sub: sub({ cost: claudeCost(CLAUDE) }) }, "kosten", NOW);
	assert.deepEqual([t.big, t.small, t.barPct, t.bottom, t.dim], ["251 / 250 $", "Budget 100%", 100, "↻ 10d10h · +1", false]);
	const cx = tileFor("codex", { sub: sub({ cost: codexCost(CODEX) }) }, "kosten", NOW);
	assert.deepEqual([cx.big, cx.small, cx.barPct], ["0", "Credits", undefined]);
	const stale = tileFor("copilot", { sub: sub({ status: "stale", cost: copilotCost(COPILOT), fetchedAt: "2026-10-25T18:30:00Z" }) }, "kosten", NOW);
	assert.deepEqual([stale.big, stale.small, stale.bottom, stale.dim], ["0", "Overage aus", "~ vor 3h", true]);
	assert.equal(tileFor("gemini", { sub: { status: "na", fetchedAt: "" } }, "kosten", NOW).big, "n/v");
	assert.equal(tileFor("grok", { sub: { status: "login", fetchedAt: "" } }, "kosten", NOW).big, "n/v");
	assert.equal(tileFor("claude", { sub: { status: "login", fetchedAt: "" } }, "kosten", NOW).big, "login");
	assert.equal(tileFor("claude", { sub: sub({}) }, "kosten", NOW).big, "n/v", "old state.json value without cost");
	// auto falls back to Kosten (not API) when there is neither a quota nor tokens.
	assert.equal(tileFor("codex", { sub: { status: "error", cost: codexCost(CODEX), fetchedAt: "" } }, "auto", NOW).small, "Credits");
	assert.equal(primaryCost([])?.label, undefined);
});

test("overview: cost row only when something is non-zero or a limit is reached", () => {
	const quiet = new Map([
		["codex", { sub: sub({ cost: codexCost(CODEX) }) }],
		["copilot", { sub: sub({ cost: copilotCost(COPILOT) }) }],
		["claude", { sub: sub({ cost: claudeCost({ extra_usage: CLAUDE.extra_usage }) }) }],
	] as const);
	assert.equal(overviewCost(quiet as any), undefined);
	assert.doesNotMatch(svgOverview(quiet as any), /\$|€/);
	const loud = new Map([...quiet, ["claude", { sub: sub({ cost: claudeCost(CLAUDE) }) }]] as const);
	assert.deepEqual(overviewCost(loud as any), { text: "CL 251 / 250 $", alert: true });
	assert.match(svgOverview(loud as any), /CL 251 \/ 250 \$/);
	const two = new Map([...loud, ["copilot", { sub: sub({ cost: copilotCost({ quota_snapshots: { premium_interactions: { overage_count: 3 } } }) }) }]] as const);
	assert.equal(overviewCost(two as any)?.text, "CL 251 / 250 $ +1");
});

test("settings: metric cycle without api by default; old 'api' becomes 'kosten'", () => {
	assert.deepEqual(metricsFor(false), ["auto", "sub", "tokens", "kosten"]);
	assert.deepEqual(metricsFor(true), ["auto", "sub", "tokens", "kosten", "api"]);
	assert.deepEqual(normalizeProviderSettings({}), { provider: "claude", metric: "auto", showApiCost: false });
	assert.equal(normalizeProviderSettings({ metric: "api" }).metric, "kosten");
	assert.equal(normalizeProviderSettings({ metric: "api", showApiCost: true }).metric, "api");
	assert.equal(normalizeProviderSettings({ showApiCost: "true" as unknown as boolean }).showApiCost, true);
});

test("cost survives the gate: stored with lastSub and shown when stale", () => {
	const good = sub({ cost: claudeCost(CLAUDE) });
	const r = applyResult(undefined, undefined, good, NOW);
	assert.equal(r.lastGood?.cost?.length, 2);
	const s = staleFrom(r.lastGood, "429, erneut in 5m", NOW + 60_000);
	assert.deepEqual([s.status, s.cost?.[1].used], ["stale", 251.205606]);
	const after429 = applyResult(undefined, r.lastGood, { status: "error", httpCode: 429, fetchedAt: "" }, NOW);
	assert.equal(after429.out.cost?.[0].label, "Extra");
});

test("hub: apiCost (keychain) is never called unless the provider is switched on", async () => {
	const calls: string[] = [];
	const orig = PROVIDERS.claude.apiCost;
	PROVIDERS.claude.apiCost = async (m) => {
		calls.push(m);
		return { provider: "claude", status: "ok", api: { status: "ok", usd: 1, month: "2026-10", fetchedAt: "" } };
	};
	try {
		const hub = new Hub();
		await hub.refreshApi();
		assert.equal(calls.length, 0);
		assert.equal(hub.views.get("claude")!.api, undefined);
		await hub.setApiProviders(["claude"]);
		assert.equal(calls.length, 1, "switching on fetches once");
		assert.equal(hub.views.get("claude")!.api?.usd, 1);
		await hub.setApiProviders([]);
		assert.equal(hub.views.get("claude")!.api, undefined, "switching off drops the value");
		await hub.refreshApi(["claude"]);
		assert.equal(calls.length, 1);
	} finally {
		PROVIDERS.claude.apiCost = orig;
	}
});
