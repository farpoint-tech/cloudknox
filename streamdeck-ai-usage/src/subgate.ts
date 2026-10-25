import { fmtAge, fmtWait } from "./format.js";
import { PROVIDERS } from "./providers/index.js";
import type { ProviderId, SubPart } from "./providers/types.js";
import { loadState, withState, type GateEntry } from "./store.js";

/**
 * Subscription gate shared by plugin and CLI (both read/write the same state.json):
 *  - reuse a good value younger than FRESH_MS instead of calling the endpoint,
 *  - after 429/5xx do not call the endpoint until the cooldown has expired,
 *  - on any fetch failure return the last good value as "stale" with the cause.
 */

export const FRESH_MS = 55_000;
/** A key press forces a network fetch at most this often per provider. */
export const FORCE_MIN_MS = 30_000;

const MIN = 60_000;
/** 429 without Retry-After: 5, 10, 20, 30, 30 … min. */
export const COOLDOWN_429 = { baseMs: 5 * MIN, maxMs: 30 * MIN };
/** 5xx without Retry-After: 1, 2, 4, 8, 8 … min. */
export const COOLDOWN_5XX = { baseMs: 1 * MIN, maxMs: 8 * MIN };
/** Upper bound for a server-supplied Retry-After. */
export const RETRY_AFTER_MAX_MS = 6 * 3600_000;

export type FailKind = "429" | "5xx";

export function failKind(httpCode: number | undefined): FailKind | undefined {
	if (httpCode === 429) return "429";
	if (httpCode !== undefined && httpCode >= 500 && httpCode <= 599) return "5xx";
	return undefined;
}

/**
 * Cooldown length for the `strikes`-th consecutive failure of `kind` (strikes >= 1).
 * Retry-After from the server wins when present (capped at RETRY_AFTER_MAX_MS); otherwise exponential backoff.
 */
export function cooldownMs(kind: FailKind, strikes: number, retryAfterMs?: number): number {
	if (retryAfterMs !== undefined) return Math.min(RETRY_AFTER_MAX_MS, Math.max(0, retryAfterMs));
	const c = kind === "429" ? COOLDOWN_429 : COOLDOWN_5XX;
	return Math.min(c.maxMs, c.baseMs * 2 ** Math.max(0, strikes - 1));
}


function causeText(e: GateEntry, now: number): string {
	const until = e.cooldownUntil ?? now;
	const code = e.kind === "429" ? "429" : `HTTP ${e.lastCode ?? "5xx"}`;
	return `${code}, erneut in ${fmtWait(until - now)}`;
}

/** Value shown while the endpoint cannot be asked: last good value marked stale, or an error when there never was one. */
export function staleFrom(lastGood: SubPart | undefined, cause: string, now: number, extra: Partial<SubPart> = {}): SubPart {
	if (lastGood?.primary) {
		return { ...lastGood, ...extra, status: "stale", source: "stale", detail: `${cause} · Wert ${fmtAge(lastGood.fetchedAt, now)}` };
	}
	return { status: "error", detail: cause, fetchedAt: new Date(now).toISOString(), ...extra, source: "stale" };
}

export type Plan = { action: "cache"; sub: SubPart } | { action: "cooldown"; sub: SubPart } | { action: "fetch" };

/** Decides whether to call the endpoint. Cooldown applies even to forced fetches. */
export function planFetch(entry: GateEntry | undefined, lastGood: SubPart | undefined, now: number, force: boolean): Plan {
	if (entry?.cooldownUntil && entry.cooldownUntil > now) {
		return {
			action: "cooldown",
			sub: staleFrom(lastGood, causeText(entry, now), now, {
				httpCode: entry.kind === "429" ? 429 : entry.lastCode,
				cooldownUntil: new Date(entry.cooldownUntil).toISOString(),
			}),
		};
	}
	if (!force && lastGood?.status === "ok" && lastGood.primary) {
		const age = now - Date.parse(lastGood.fetchedAt);
		if (age >= 0 && age < FRESH_MS) return { action: "cache", sub: { ...lastGood, source: "cache" } };
	}
	return { action: "fetch" };
}

/**
 * Folds a fetch result into the gate entry and last good value.
 * Returns the new entry (undefined = cleared), the new last good value and the SubPart to display.
 */
export function applyResult(
	entry: GateEntry | undefined,
	lastGood: SubPart | undefined,
	res: SubPart,
	now: number,
): { entry?: GateEntry; lastGood?: SubPart; out: SubPart } {
	if (res.status === "ok" && res.primary) {
		const good: SubPart = { ...res, source: "net" };
		delete good.httpCode;
		delete good.retryAfterMs;
		delete good.cooldownUntil;
		return { entry: undefined, lastGood: good, out: good };
	}
	const kind = failKind(res.httpCode);
	if (kind) {
		const strikes = entry?.kind === kind ? (entry.strikes ?? 0) + 1 : 1;
		const until = now + cooldownMs(kind, strikes, res.retryAfterMs);
		const next: GateEntry = { kind, strikes, cooldownUntil: until, lastCode: res.httpCode, since: entry?.kind === kind ? entry.since : new Date(now).toISOString() };
		return {
			entry: next,
			lastGood,
			out: staleFrom(lastGood, causeText(next, now), now, { httpCode: res.httpCode, retryAfterMs: res.retryAfterMs, cooldownUntil: new Date(until).toISOString() }),
		};
	}
	// Other failures (offline, unexpected body, plain HTTP errors): no cooldown, keep the value visible.
	if ((res.status === "offline" || res.status === "error") && lastGood?.primary) {
		return { entry, lastGood, out: staleFrom(lastGood, `${res.status}: ${res.detail ?? ""}`.trim(), now, { httpCode: res.httpCode }) };
	}
	// login / na / key_missing or nothing good yet: show as is.
	return { entry, lastGood, out: { ...res, source: "net" } };
}

/** True when a forced fetch is allowed (at most one per FORCE_MIN_MS per provider). */
export function allowForce(lastForcedAt: number | undefined, now: number): boolean {
	return lastForcedAt === undefined || now - lastForcedAt >= FORCE_MIN_MS;
}

const inflight = new Map<ProviderId, Promise<SubPart>>();
const lastForced = new Map<ProviderId, number>();

export interface GateOptions {
	/** Skip the 55 s shared cache (key press, `status --fresh`). Never skips a cooldown. */
	force?: boolean;
	/** Test hook: replaces PROVIDERS[id].subscription(). */
	fetcher?: () => Promise<SubPart>;
	now?: () => number;
}

/**
 * Subscription value for `id` through the gate. Concurrent calls for the same provider in this
 * process share one request (single flight).
 */
export function gatedSub(id: ProviderId, opts: GateOptions = {}): Promise<SubPart> {
	const running = inflight.get(id);
	if (running) return running;
	const p = run(id, opts).finally(() => inflight.delete(id));
	inflight.set(id, p);
	return p;
}

async function run(id: ProviderId, opts: GateOptions): Promise<SubPart> {
	const clock = opts.now ?? Date.now;
	const fetcher = opts.fetcher ?? (async () => (await PROVIDERS[id].subscription()).sub!);
	let force = !!opts.force;
	if (force) {
		if (allowForce(lastForced.get(id), clock())) lastForced.set(id, clock());
		else force = false;
	}
	const s = await loadState();
	const plan = planFetch(s.subGate[id], s.lastSub[id], clock(), force);
	if (plan.action !== "fetch") return plan.sub;

	const res = await fetcher();
	return withState((st) => {
		// Re-read inside the lock: another process may have stored a newer value meanwhile.
		const r = applyResult(st.subGate[id], st.lastSub[id], res, clock());
		if (r.entry) st.subGate[id] = r.entry;
		else delete st.subGate[id];
		if (r.lastGood) st.lastSub[id] = r.lastGood;
		return r.out;
	}).catch(() => applyResult(s.subGate[id], s.lastSub[id], res, clock()).out);
}

/** Test hook. */
export function resetGateMemory(): void {
	inflight.clear();
	lastForced.clear();
}
