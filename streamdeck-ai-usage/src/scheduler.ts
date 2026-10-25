import { lastSundaySlot } from "./format.js";
import type { Hub } from "./hub.js";
import { reconcile } from "./reconcile.js";
import { PROVIDER_IDS, type ProviderId } from "./providers/types.js";
import { loadState } from "./store.js";

export const SUB_MS = 120_000;
export const SUB_JITTER_MS = 10_000;
/** Startup offset between providers so their first requests do not share a second. */
const SUB_STAGGER_MS = 4_000;
const RECONCILE_CHECK_MS = 60_000;
const TOKENS_MS = 15 * 60_000;
const API_MS = 6 * 3600_000;
const WEEK_MS = 7 * 86_400_000;

export type Log = (level: "info" | "warn" | "error", msg: string) => void;

/** Next subscription delay: SUB_MS ± SUB_JITTER_MS. `rand` in [0,1). */
export function subDelayMs(rand: number = Math.random()): number {
	return Math.round(SUB_MS + (rand * 2 - 1) * SUB_JITTER_MS);
}

/**
 * Plugin-side timers. Subscription refresh per provider every 120 s ± 10 s, only while at least one key is visible;
 * local tokens every 15 min; API cost every 6 h; reconcile Sunday 20:00 (window 20:00–20:59)
 * plus catch-up on start when the last reconcile is older than 7 days.
 */
export class Scheduler {
	private visible = 0;
	private timers: NodeJS.Timeout[] = [];
	private subTimers = new Map<ProviderId, NodeJS.Timeout>();
	private stopped = false;
	private busy = new Set<string>();

	constructor(
		private hub: Hub,
		private log: Log,
	) {}

	/** Runs `fn` unless a job with the same name is still running. */
	private async once(name: string, fn: () => Promise<unknown>): Promise<void> {
		if (this.busy.has(name)) return;
		this.busy.add(name);
		try {
			await fn();
		} catch (e) {
			this.log("error", `${name}: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.busy.delete(name);
		}
	}

	refreshSub(): Promise<void> {
		return this.once("sub", () => this.hub.refreshSub());
	}
	private refreshSubOne(id: ProviderId): Promise<void> {
		return this.once(`sub:${id}`, () => this.hub.refreshSub([id]));
	}

	/** Self-rescheduling per-provider timer with fresh jitter each round. */
	private scheduleSub(id: ProviderId, delay: number): void {
		if (this.stopped) return;
		const t = setTimeout(() => {
			if (this.visible > 0) void this.refreshSubOne(id);
			this.scheduleSub(id, subDelayMs());
		}, delay);
		this.subTimers.set(id, t);
	}
	refreshTokens(): Promise<void> {
		return this.once("tokens", () => this.hub.refreshTokens());
	}
	refreshApi(): Promise<void> {
		return this.once("api", () => this.hub.refreshApi());
	}

	keyAppeared(): void {
		this.visible++;
		if (Date.now() - this.hub.lastSubRefresh > SUB_MS) void this.refreshSub();
	}

	keyDisappeared(): void {
		this.visible = Math.max(0, this.visible - 1);
	}

	async start(): Promise<void> {
		this.stopped = false;
		await this.hub.init();
		PROVIDER_IDS.forEach((id, i) => {
			// First round staggered (0 s, 4 s, 8 s …), then every 120 s ± 10 s.
			this.timers.push(setTimeout(() => void this.refreshSubOne(id), i * SUB_STAGGER_MS));
			this.scheduleSub(id, i * SUB_STAGGER_MS + subDelayMs());
		});
		void this.refreshApi();
		void this.refreshTokens();
		this.timers.push(
			setInterval(() => void this.checkReconcile(false), RECONCILE_CHECK_MS),
			setInterval(() => void this.refreshTokens(), TOKENS_MS),
			setInterval(() => void this.refreshApi(), API_MS),
		);
		void this.checkReconcile(true);
	}

	stop(): void {
		this.stopped = true;
		for (const t of this.timers) clearInterval(t);
		this.timers = [];
		for (const t of this.subTimers.values()) clearTimeout(t);
		this.subTimers.clear();
	}

	private async checkReconcile(startup: boolean): Promise<void> {
		const s = await loadState();
		const last = s.lastReconcile ? Date.parse(s.lastReconcile) : 0;
		const now = Date.now();
		const slot = lastSundaySlot(new Date(now)).getTime();
		const inWindow = now - slot < 3600_000 && last < slot;
		const catchUp = startup && now - last > WEEK_MS;
		if (!inWindow && !catchUp) return;
		await this.once("reconcile", async () => {
			const r = await reconcile({ scheduled: inWindow && !catchUp });
			this.log("info", r.ran ? `reconcile: ${r.lines.length} Zeilen` : `reconcile übersprungen: ${r.reason}`);
			if (r.ran) await this.hub.refreshAll();
		});
	}
}
