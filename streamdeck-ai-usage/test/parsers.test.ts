// Synthetic fixtures modelled on the response/log shapes documented in SPEC.md and RESEARCH.md.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeLine } from "../src/collectors/claude-jsonl.js";
import { codexDelta, parseCodexLine } from "../src/collectors/codex-jsonl.js";
import { copilotDelta } from "../src/collectors/copilot-sqlite.js";
import { parseGeminiLine } from "../src/collectors/gemini-jsonl.js";
import { fmtTokens, fmtUsd, isoWeek, lastSundaySlot } from "../src/format.js";
import { mapClaudeUsage, sumAnthropicCost } from "../src/providers/claude.js";
import { mapCodexUsage, sumOpenAICost } from "../src/providers/codex.js";
import { mapCopilotUser, sumCopilotBilling } from "../src/providers/copilot.js";
import { centsOf } from "../src/providers/grok.js";
import { tileFor } from "../src/render.js";

test("claude jsonl: usage line parsed, dedupe key = message.id:requestId", () => {
	const line = JSON.stringify({
		type: "assistant",
		timestamp: "2026-10-25T10:00:00.000Z",
		requestId: "req_1",
		message: { id: "msg_1", model: "claude-x", usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 5 } },
	});
	const p = parseClaudeLine(line)!;
	assert.equal(p.key, "msg_1:req_1");
	assert.deepEqual([p.in, p.cached, p.out], [110, 1000, 5]);
	assert.equal(parseClaudeLine(JSON.stringify({ type: "user", timestamp: "2026-10-25T10:00:00Z" })), null);
	assert.equal(parseClaudeLine("not json \"usage\""), null);
});

test("codex token_count: cumulative totals become deltas, repeats count zero", () => {
	const ev = (input: number, cached: number, output: number) =>
		JSON.stringify({
			timestamp: "2026-10-25T20:32:22.829Z",
			type: "event_msg",
			payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } }, rate_limits: {} },
		});
	const a = parseCodexLine(ev(1000, 400, 50))!;
	const b = parseCodexLine(ev(1000, 400, 50))!;
	const c = parseCodexLine(ev(1500, 600, 80))!;
	const d1 = codexDelta(undefined, a.total);
	assert.deepEqual(d1, { in: 600, cached: 400, out: 50 });
	assert.deepEqual(codexDelta(a.total, b.total), { in: 0, cached: 0, out: 0 });
	assert.deepEqual(codexDelta(b.total, c.total), { in: 300, cached: 200, out: 30 });
	// counter reset (new session reusing the file) counts from zero
	assert.deepEqual(codexDelta(c.total, { input: 10, cached: 0, output: 1 }), { in: 10, cached: 0, out: 1 });
	assert.equal(parseCodexLine(JSON.stringify({ type: "event_msg", payload: { type: "agent_message" } })), null);
});

test("gemini chat record with tokens; records without tokens ignored", () => {
	const g = parseGeminiLine(JSON.stringify({ id: "m1", timestamp: "2026-10-25T20:17:00Z", type: "gemini", content: "x", tokens: { input: 100, output: 20, cached: 30, thoughts: 5, total: 125 } }))!;
	assert.deepEqual([g.id, g.in, g.cached, g.out], ["m1", 70, 30, 25]);
	assert.equal(parseGeminiLine(JSON.stringify({ id: "u1", timestamp: "2026-10-25T20:17:00Z", type: "user", content: [{ text: "tokens" }] })), null);
	assert.equal(parseGeminiLine(JSON.stringify({ $set: { lastUpdated: "2026-10-25T20:17:00Z" } })), null);
});

test("copilot sessions: delta of cumulative totals", () => {
	assert.deepEqual(copilotDelta(undefined, { id: "s", i: 500, o: 40, c: 100, u: "2026-10-25T00:00:00Z" }), { in: 400, cached: 100, out: 40 });
	assert.deepEqual(copilotDelta({ in: 500, out: 40, cached: 100 }, { id: "s", i: 700, o: 50, c: 150, u: "x" }), { in: 150, cached: 50, out: 10 });
});

test("claude oauth usage maps five_hour/seven_day", () => {
	const w = mapClaudeUsage({
		five_hour: { utilization: 27, resets_at: "2026-10-25T23:00:00Z" },
		seven_day: { utilization: 6, resets_at: "2026-10-30T00:00:00Z" },
		extra_usage: { is_enabled: false },
		iguana_necktie: null,
	});
	assert.deepEqual(w.primary, { label: "5h", pct: 27, resetAt: "2026-10-25T23:00:00Z" });
	assert.equal(w.secondary?.label, "Wo");
	assert.equal(mapClaudeUsage({}).primary, undefined);
});

test("codex wham/usage maps windows, secondary may be null", () => {
	const m = mapCodexUsage({
		plan_type: "pro",
		rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18000, reset_at: 1793519732 }, secondary_window: null },
		credits: { balance: "0" },
	});
	assert.equal(m.primary?.label, "5h");
	assert.equal(m.primary?.pct, 12);
	assert.equal(m.primary?.resetAt, new Date(1793519732 * 1000).toISOString());
	assert.equal(m.secondary, undefined);
	assert.equal(m.plan, "pro");
	assert.equal(mapCodexUsage({ rate_limit: { primary_window: { used_percent: 1, limit_window_seconds: 604800 } } }).primary?.label, "Wo");
});

test("copilot quota: premium primary; entitlement 0 falls back to chat", () => {
	const paid = mapCopilotUser({
		copilot_plan: "individual_pro",
		quota_reset_date: "2026-11-01",
		quota_snapshots: { premium_interactions: { entitlement: 300, remaining: 240, percent_remaining: 80, unlimited: false }, chat: { unlimited: true } },
	});
	assert.equal(paid.primary?.label, "Prem");
	assert.equal(paid.primary?.pct, 20);
	assert.equal(paid.secondary?.label, "Chat ∞");
	const free = mapCopilotUser({
		quota_snapshots: {
			premium_interactions: { entitlement: 0, percent_remaining: 0, unlimited: false },
			chat: { entitlement: 200, percent_remaining: 99, unlimited: false },
			completions: { entitlement: 2000, percent_remaining: 100, unlimited: false },
		},
	});
	assert.equal(free.primary?.label, "Chat");
	assert.equal(free.primary?.pct, 1);
	assert.equal(free.secondary?.label, "Code");
});

test("cost parsers: Anthropic cents strings, OpenAI dollars, GitHub netAmount, xAI cents", () => {
	assert.ok(Math.abs(sumAnthropicCost({ data: [{ results: [{ amount: "123.45", currency: "USD" }] }, { results: [{ amount: "100" }] }] }) - 2.2345) < 1e-9);
	assert.equal(sumOpenAICost({ data: [{ results: [{ amount: { value: 1.5, currency: "usd" } }] }, { results: [{ amount: { value: 0.25 } }] }] }), 1.75);
	assert.ok(Math.abs(sumCopilotBilling({ usageItems: [{ product: "copilot", netAmount: 0.04 }, { netAmount: 1 }] }) - 1.04) < 1e-9);
	assert.equal(centsOf("1234"), 1234);
	assert.equal(centsOf({ val: "50" }), 50);
	assert.equal(sumAnthropicCost({}), 0);
});

test("format + tile rendering", () => {
	assert.equal(fmtTokens(1_234_567), "1,2M");
	assert.equal(fmtUsd(12.4), "$ 12,40");
	assert.equal(isoWeek(new Date(2026, 9, 25)), "2026-W43");
	const slot = lastSundaySlot(new Date(2026, 9, 25, 21, 0));
	assert.deepEqual([slot.getDate(), slot.getHours()], [25, 20]);
	assert.equal(lastSundaySlot(new Date(2026, 9, 25, 19, 0)).getDate(), 18);
	const now = Date.parse("2026-10-25T20:00:00Z");
	const t = tileFor("claude", { sub: { status: "ok", primary: { label: "5h", pct: 27, resetAt: "2026-10-25T22:14:00Z" }, secondary: { label: "Wo", pct: 6 }, fetchedAt: "2026-10-25T20:00:00Z" } }, "auto", now);
	assert.deepEqual([t.big, t.small, t.bottom], ["5h 27%", "Wo 6%", "↻ 2h14"]);
	const stale = tileFor("claude", { sub: { status: "offline", primary: { label: "5h", pct: 27 }, fetchedAt: "2026-10-25T17:00:00Z" } }, "sub", now);
	assert.equal(stale.bottom, "~ vor 3h");
	assert.equal(tileFor("grok", { api: { status: "key_missing", month: "2026-10", fetchedAt: "" } }, "api", now).big, "Key fehlt");
	assert.equal(tileFor("gemini", { sub: { status: "na", fetchedAt: "" } }, "sub", now).big, "n/v");
});
