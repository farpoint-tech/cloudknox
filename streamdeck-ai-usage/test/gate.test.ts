import "./support/temp-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { subCheck } from "../src/doctor.js";
import { parseRetryAfter } from "../src/http.js";
import type { SubPart } from "../src/providers/types.js";
import { overviewValue, svgTile, tileFor } from "../src/render.js";
import { SUB_JITTER_MS, SUB_MS, subDelayMs } from "../src/scheduler.js";
import { loadState } from "../src/store.js";
import { applyResult, cooldownMs, gatedSub, planFetch, resetGateMemory, type Plan } from "../src/subgate.js";
import type { GateEntry } from "../src/store.js";

const MIN = 60_000;
const T0 = Date.parse("2026-10-25T20:00:00Z");
const good = (at: number, pct = 27): SubPart => ({
	status: "ok",
	primary: { label: "5h", pct, resetAt: "2026-10-25T22:14:00Z" },
	secondary: { label: "Wo", pct: 6 },
	fetchedAt: new Date(at).toISOString(),
});
const fail = (code: number, retryAfterMs?: number): SubPart => ({ status: "error", detail: `HTTP ${code}`, httpCode: code, retryAfterMs, fetchedAt: new Date(T0).toISOString() });

test("Retry-After: delta-seconds and HTTP date", () => {
	assert.equal(parseRetryAfter("120", T0), 120_000);
	assert.equal(parseRetryAfter(" 0 ", T0), 0);
	assert.equal(parseRetryAfter(new Date(T0 + 90_000).toUTCString(), T0), 90_000);
	assert.equal(parseRetryAfter("Sun, 25 Oct 2026 19:00:00 GMT", T0), 0, "past date clamps to 0");
	assert.equal(parseRetryAfter("soon", T0), undefined);
	assert.equal(parseRetryAfter("", T0), undefined);
	assert.equal(parseRetryAfter(null, T0), undefined);
	assert.equal(parseRetryAfter(undefined, T0), undefined);
});

test("cooldown progression: 429 5→10→20→30→30 min, 5xx 1→2→4→8→8 min, Retry-After wins, success resets", () => {
	const walk = (code: number, n: number) => {
		let e: GateEntry | undefined;
		const out: number[] = [];
		for (let i = 0; i < n; i++) {
			const r = applyResult(e, good(T0 - 10 * MIN), fail(code), T0);
			e = r.entry;
			out.push((e!.cooldownUntil - T0) / MIN);
		}
		return { e, out };
	};
	assert.deepEqual(walk(429, 5).out, [5, 10, 20, 30, 30]);
	assert.deepEqual(walk(503, 5).out, [1, 2, 4, 8, 8]);
	assert.equal(cooldownMs("429", 1, 42_000), 42_000);
	const ra = applyResult(undefined, undefined, fail(429, 7 * MIN), T0);
	assert.equal(ra.entry!.cooldownUntil - T0, 7 * MIN);
	// kind switch starts a new streak
	const e429 = walk(429, 3).e!;
	assert.equal(applyResult(e429, undefined, fail(502), T0).entry!.strikes, 1);
	// success clears the entry and becomes the last good value
	const ok = applyResult(e429, undefined, good(T0), T0);
	assert.equal(ok.entry, undefined);
	assert.equal(ok.lastGood?.primary?.pct, 27);
	assert.equal(ok.out.source, "net");
	// a 401 is not a cooldown
	assert.equal(applyResult(undefined, undefined, { ...fail(401), status: "login" }, T0).entry, undefined);
});

test("planFetch: cooldown blocks even forced fetches; 55 s cache only without force", () => {
	const entry: GateEntry = { kind: "429", strikes: 1, cooldownUntil: T0 + 4 * MIN, lastCode: 429 };
	const p1 = planFetch(entry, good(T0 - 12 * MIN), T0, true) as Extract<Plan, { action: "cooldown" }>;
	assert.equal(p1.action, "cooldown");
	assert.equal(p1.sub.status, "stale");
	assert.equal(p1.sub.primary?.pct, 27);
	assert.equal(p1.sub.httpCode, 429);
	assert.match(p1.sub.detail!, /^429, erneut in 4m · Wert vor 12m$/);
	assert.equal(planFetch(entry, good(T0 - 12 * MIN), T0 + 4 * MIN, false).action, "fetch", "expired cooldown fetches again");
	assert.equal(planFetch(undefined, good(T0 - 54_000), T0, false).action, "cache");
	assert.equal(planFetch(undefined, good(T0 - 56_000), T0, false).action, "fetch");
	assert.equal(planFetch(undefined, good(T0 - 1_000), T0, true).action, "fetch");
	const none = planFetch(entry, undefined, T0, false) as Extract<Plan, { action: "cooldown" }>;
	assert.equal(none.sub.status, "error", "no good value ever: error, not stale");
	assert.equal(none.sub.detail, "429, erneut in 4m");
});

test("stale fallback rendering: value stays, age + '~', hourglass; 'Fehler' only without any good value", () => {
	const now = T0;
	const staleSub: SubPart = { ...good(now - 12 * MIN), status: "stale", source: "stale", httpCode: 429, cooldownUntil: new Date(now + 4 * MIN).toISOString(), detail: "429, erneut in 4m" };
	const t = tileFor("claude", { sub: staleSub }, "auto", now);
	assert.deepEqual([t.big, t.small, t.bottom, t.dim, t.cooldown], ["5h 27%", "Wo 6%", "~ vor 12m", true, true]);
	assert.equal(t.barPct, 27);
	assert.match(svgTile(t), /stroke="#F5A524"/, "hourglass drawn");
	assert.doesNotMatch(svgTile(tileFor("claude", { sub: good(now) }, "auto", now)), /stroke="#F5A524"/);
	// stale without cooldown (offline): value + age, no hourglass
	const off = tileFor("claude", { sub: { ...good(now - 3 * 3600_000), status: "stale" } }, "sub", now);
	assert.deepEqual([off.big, off.bottom, off.cooldown], ["5h 27%", "~ vor 3h", false]);
	// never a good value
	const err = tileFor("claude", { sub: { status: "error", httpCode: 429, detail: "429, erneut in 4m", cooldownUntil: new Date(now + 4 * MIN).toISOString(), fetchedAt: "" } }, "sub", now);
	assert.deepEqual([err.big, err.small, err.bottom], ["Fehler", "Abo · 429", "erneut 4m"]);
	assert.deepEqual(overviewValue({ sub: staleSub }), { text: "~27%", pct: 27, dim: true });
});

test("single-flight: second call within 55 s reuses state.json, force once per 30 s, 429 serves stale without network", async () => {
	resetGateMemory();
	let calls = 0;
	let next: SubPart = good(T0);
	let clock = T0;
	const opts = (force = false) => ({ force, now: () => clock, fetcher: async () => (calls++, { ...next, fetchedAt: new Date(clock).toISOString() }) });

	const a = await gatedSub("codex", opts());
	assert.deepEqual([a.source, calls], ["net", 1]);
	assert.equal((await loadState()).lastSub.codex?.fetchedAt, new Date(T0).toISOString(), "last good persisted with fetchedAt");

	clock = T0 + 20_000;
	const b = await gatedSub("codex", opts());
	assert.deepEqual([b.source, calls], ["cache", 1], "reused, no network");

	const [c1, c2] = await Promise.all([gatedSub("codex", opts(true)), gatedSub("codex", opts(true))]);
	assert.equal(calls, 2, "concurrent calls share one request");
	assert.equal(c1, c2);

	clock = T0 + 30_000;
	assert.equal((await gatedSub("codex", opts(true))).source, "cache", "second forced fetch within 30 s falls back to cache");
	assert.equal(calls, 2);

	clock = T0 + 60_000;
	next = fail(429, 3 * MIN);
	const d = await gatedSub("codex", opts(true));
	assert.deepEqual([d.status, d.primary?.pct, d.httpCode, calls], ["stale", 27, 429, 3]);
	assert.match(d.detail!, /^429, erneut in 3m/);

	clock = T0 + 2 * MIN;
	next = good(clock, 50);
	const e = await gatedSub("codex", opts(true));
	assert.deepEqual([e.status, calls], ["stale", 3], "cooldown: no network call");

	clock = T0 + 60_000 + 3 * MIN;
	const f = await gatedSub("codex", opts());
	assert.deepEqual([f.status, f.primary?.pct, calls], ["ok", 50, 4]);
	assert.equal((await loadState()).subGate.codex, undefined, "success resets the cooldown");
});

test("scheduler: 120 s ± 10 s jitter", () => {
	assert.equal(SUB_MS, 120_000);
	assert.equal(subDelayMs(0), SUB_MS - SUB_JITTER_MS);
	assert.equal(subDelayMs(0.5), SUB_MS);
	assert.ok(subDelayMs(0.999999) <= SUB_MS + SUB_JITTER_MS);
});

test("doctor: 429 is a warning, not invalid", () => {
	const w = subCheck("claude", "GET x", fail(429));
	assert.equal(w.result, "warn");
	assert.match(w.note!, /rate-limited \(andere Plugins pollen denselben Endpunkt\)/);
	assert.equal(subCheck("claude", "GET x", { ...fail(401), status: "login" }).result, "invalid");
	assert.equal(subCheck("claude", "GET x", good(T0)).result, "ok");
});
