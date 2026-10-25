import "./support/temp-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { Hub } from "../src/hub.js";
import { claudeResets } from "../src/providers/claude.js";
import { codexResets } from "../src/providers/codex.js";
import { copilotResets } from "../src/providers/copilot.js";
import type { ResetEvent } from "../src/providers/types.js";
import { svgResets } from "../src/render.js";
import { blinkInfo, fmtResetCountdown, fmtResetLocal, normalizeBlinkHours, resetsOf, topResets, upcomingResets } from "../src/resets.js";
import { withState } from "../src/store.js";

const H = 3600_000;
const NOW = Date.parse("2026-10-25T20:00:00Z");
const ev = (provider: ResetEvent["provider"], window: string, inHours: number, pct?: number): ResetEvent => ({
	provider,
	window,
	resetsAt: new Date(NOW + inHours * H).toISOString(),
	pct,
});

// Shape of the live response of 2026-10-25 (extra_usage without any reset field).
const CLAUDE_LIVE = {
	five_hour: { utilization: 0, resets_at: "2026-10-26T01:59:59.916585+00:00", limit_dollars: null },
	seven_day: { utilization: 8, resets_at: "2026-10-31T23:59:59.916603+00:00" },
	extra_usage: { is_enabled: false, monthly_limit: 2500, used_credits: 0, utilization: 0, currency: "EUR", daily: null, weekly: null },
	limits: [{ kind: "session", resets_at: "2026-10-26T01:59:59.916585+00:00" }],
};

test("claude: five_hour → 5h, seven_day → Woche; extra_usage only when it carries a reset time", () => {
	const r = claudeResets(CLAUDE_LIVE);
	assert.deepEqual(
		r.map((e) => [e.provider, e.window, e.resetsAt, e.pct]),
		[
			["claude", "5h", "2026-10-26T01:59:59.916Z", 0],
			["claude", "Woche", "2026-10-31T23:59:59.916Z", 8],
		],
	);
	const withExtra = claudeResets({ ...CLAUDE_LIVE, extra_usage: { ...CLAUDE_LIVE.extra_usage, utilization: 12, resets_at: "2026-11-01T00:00:00Z" } });
	assert.deepEqual(withExtra[2], { provider: "claude", window: "Extra", resetsAt: "2026-11-01T00:00:00.000Z", pct: 12 });
	assert.deepEqual(claudeResets({ five_hour: { utilization: 3, resets_at: null } }), [], "null resets_at = no event");
	assert.deepEqual(claudeResets({}), []);
});

test("codex: primary 7 d → Woche, secondary 5 h → 5h, null secondary skipped, unix seconds converted", () => {
	const both = codexResets({
		rate_limit: {
			primary_window: { used_percent: 1, limit_window_seconds: 604800, reset_at: 1793519732 },
			secondary_window: { used_percent: 40, limit_window_seconds: 18000, reset_at: 1793000000 },
		},
	});
	assert.deepEqual(
		both.map((e) => [e.window, e.resetsAt, e.pct]),
		[
			["Woche", new Date(1793519732 * 1000).toISOString(), 1],
			["5h", new Date(1793000000 * 1000).toISOString(), 40],
		],
	);
	const one = codexResets({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 604800, reset_at: 1793519732 }, secondary_window: null } });
	assert.equal(one.length, 1);
	assert.equal(one[0].provider, "codex");
	assert.deepEqual(codexResets({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 604800 } } }), [], "no reset_at");
});

test("copilot: quota_reset_date → one monthly event with the primary window's pct", () => {
	const r = copilotResets({
		copilot_plan: "individual",
		quota_reset_date: "2026-11-01",
		quota_snapshots: {
			premium_interactions: { entitlement: 0, percent_remaining: 0, unlimited: false },
			chat: { entitlement: 200, percent_remaining: 99, unlimited: false },
			completions: { entitlement: 2000, percent_remaining: 100, unlimited: false },
		},
	});
	assert.deepEqual(r, [{ provider: "copilot", window: "Monat", resetsAt: "2026-11-01T00:00:00.000Z", pct: 1 }]);
	assert.deepEqual(copilotResets({ quota_snapshots: {} }), []);
});

test("sorting, past events dropped, top-2 selection and +N count", () => {
	const list = [ev("copilot", "Monat", 150), ev("claude", "5h", 2), ev("codex", "Woche", 30), ev("claude", "Woche", -1), ev("grok", "Monat", 2), ev("claude", "Extra", 150)];
	const up = upcomingResets(list, NOW);
	assert.deepEqual(
		up.map((e) => `${e.provider} ${e.window}`),
		["claude 5h", "grok Monat", "codex Woche", "claude Extra", "copilot Monat"],
		"ascending; equal times by provider order; the passed one is gone",
	);
	const top = topResets(list, NOW);
	assert.deepEqual(
		top.shown.map((e) => `${e.provider} ${e.window}`),
		["claude 5h", "grok Monat"],
	);
	assert.equal(top.hidden, 3);
	assert.deepEqual(topResets([ev("claude", "5h", -0.1)], NOW), { shown: [], hidden: 0 });
});

test("blink only when MORE than 2 resets fall within the window", () => {
	const two = [ev("claude", "5h", 1), ev("codex", "5h", 23), ev("claude", "Woche", 25)];
	assert.deepEqual(blinkInfo(two, NOW, 24), { inWindow: 2, blink: false });
	const three = [...two, ev("copilot", "Monat", 24)]; // exactly at the window end counts
	assert.deepEqual(blinkInfo(three, NOW, 24), { inWindow: 3, blink: true });
	assert.equal(blinkInfo(three, NOW, 2).blink, false, "smaller window");
	assert.equal(blinkInfo([...three, ev("grok", "Monat", -1)], NOW, 24).inWindow, 3, "past events never count");
	assert.equal(normalizeBlinkHours("48"), 48);
	assert.equal(normalizeBlinkHours("1,5"), 1.5);
	assert.equal(normalizeBlinkHours(""), 24);
	assert.equal(normalizeBlinkHours(-3), 24);
	assert.equal(normalizeBlinkHours(undefined), 24);
});

test("countdown and local time formatting", () => {
	const t = (ms: number) => new Date(NOW + ms).toISOString();
	assert.equal(fmtResetCountdown(t(13 * 60_000 + 59_000), NOW), "in 13m");
	assert.equal(fmtResetCountdown(t(2 * H + 13 * 60_000), NOW), "in 2h 13m");
	assert.equal(fmtResetCountdown(t(2 * H), NOW), "in 2h 0m");
	assert.equal(fmtResetCountdown(t(3 * 24 * H + 4 * H + 59 * 60_000), NOW), "in 3d 4h");
	assert.equal(fmtResetCountdown(t(30_000), NOW), "in <1m");
	assert.equal(fmtResetCountdown("kaputt", NOW), "");
	// Local constructors keep these independent of the machine's time zone.
	const sun = new Date(2026, 9, 25, 18, 0).getTime(); // Sunday
	assert.equal(fmtResetLocal(new Date(2026, 9, 25, 21, 0).toISOString(), sun), "So 21:00");
	assert.equal(fmtResetLocal(new Date(2026, 9, 30, 9, 5).toISOString(), sun), "Fr 09:05");
	assert.equal(fmtResetLocal(new Date(2026, 10, 4, 0, 0).toISOString(), sun), "Mi 04.11.");
});

test("resets of an older state.json value are derived from its windows", () => {
	const r = resetsOf("copilot", {
		status: "ok",
		primary: { label: "Chat", pct: 1, resetAt: "2026-11-01T00:00:00.000Z" },
		secondary: { label: "Code", pct: 0, resetAt: "2026-11-01T00:00:00.000Z" },
		fetchedAt: "2026-10-25T20:54:27.600Z",
	});
	assert.deepEqual(r, [{ provider: "copilot", window: "Monat", resetsAt: "2026-11-01T00:00:00.000Z", pct: 1 }], "same month counted once");
	const c = resetsOf("claude", {
		status: "ok",
		primary: { label: "5h", pct: 40, resetAt: "2026-10-25T21:00:00.219596+00:00" },
		secondary: { label: "Wo", pct: 8, resetAt: "2026-11-01T00:00:00.219613+00:00" },
		fetchedAt: "x",
	});
	assert.deepEqual(
		c.map((e) => e.window),
		["5h", "Woche"],
	);
	assert.deepEqual(resetsOf("claude", { status: "ok", primary: { label: "5h", pct: 1 }, resets: [], fetchedAt: "x" }), [], "explicit list wins");
});

test("hub: resets come from the persisted last good value; past ones are dropped", async () => {
	const future = new Date(Date.now() + 5 * H).toISOString();
	const past = new Date(Date.now() - H).toISOString();
	await withState((s) => {
		s.lastSub.claude = {
			status: "ok",
			primary: { label: "5h", pct: 40, resetAt: past },
			resets: [
				{ provider: "claude", window: "5h", resetsAt: past, pct: 40 },
				{ provider: "claude", window: "Woche", resetsAt: future, pct: 8 },
			],
			fetchedAt: new Date(Date.now() - 2 * H).toISOString(),
		};
		s.lastSub.copilot = { status: "ok", primary: { label: "Chat", pct: 1, resetAt: future }, fetchedAt: new Date().toISOString() };
	});
	const hub = new Hub();
	await hub.init();
	assert.deepEqual(
		hub.allResets().map((e) => `${e.provider} ${e.window}`),
		["claude Woche", "copilot Monat"],
	);
	assert.equal(hub.views.get("claude")!.sub?.status, "stale", "value is stale, its resets still count");
});

test("resets key SVG: empty text, badge, amber blink frame, mute marker", () => {
	assert.match(svgResets({ shown: [], hidden: 0, alt: false, muted: false }, NOW), /keine Resets/);
	const shown = [ev("claude", "5h", 2 + 13 / 60), ev("codex", "Woche", 75)];
	const normal = svgResets({ shown, hidden: 3, alt: false, muted: false }, NOW);
	assert.match(normal, />Claude 5h</);
	assert.match(normal, />in 2h 13m</);
	assert.match(normal, />Codex Woche</);
	assert.match(normal, />\+3</);
	assert.match(normal, /fill="#111111"\/>/);
	const alt = svgResets({ shown, hidden: 3, alt: true, muted: false }, NOW);
	assert.match(alt, /<rect width="144" height="144" fill="#F5A524"\/>/);
	assert.match(svgResets({ shown, hidden: 0, alt: false, muted: true }, NOW), /RESETS · stumm/);
	assert.doesNotMatch(svgResets({ shown, hidden: 0, alt: false, muted: false }, NOW), />\+\d/);
});
