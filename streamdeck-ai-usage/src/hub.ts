import { startOfMonth, startOfToday, startOfWeek } from "./format.js";
import { PROVIDERS, PROVIDER_IDS, type ApiPart, type ProviderId, type ResetEvent, type SubPart, type TokenPart } from "./providers/index.js";
import { resetsOf, upcomingResets } from "./resets.js";
import { loadState, withState } from "./store.js";
import { gatedSub } from "./subgate.js";

export interface View {
	sub?: SubPart;
	today?: TokenPart;
	week?: TokenPart;
	api?: ApiPart;
}

/**
 * In-memory view of all providers. Each source refreshes independently;
 * a failed refresh keeps the last good values (rendered with their age).
 */
export class Hub {
	readonly views = new Map<ProviderId, View>(PROVIDER_IDS.map((id) => [id, {}]));
	private listeners = new Set<() => void>();
	lastSubRefresh = 0;
	/**
	 * Last known resets per provider. Kept when a later fetch has no value (login, 429 without a value),
	 * because a known reset time stays true until it has passed; passed ones are dropped by allResets().
	 */
	readonly resetsBy = new Map<ProviderId, ResetEvent[]>();

	/** Remembers the resets of a SubPart that carries a value. */
	private noteResets(id: ProviderId, sub: SubPart | undefined): void {
		if (sub?.primary) this.resetsBy.set(id, resetsOf(id, sub));
	}

	/** All future resets of all providers, soonest first. */
	allResets(now = Date.now()): ResetEvent[] {
		return upcomingResets([...this.resetsBy.values()].flat(), now);
	}

	onChange(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(): void {
		for (const fn of this.listeners) {
			try {
				fn();
			} catch {
				/* a broken listener must not stop the others */
			}
		}
	}

	/** Seeds subscription values persisted by an earlier run (shown as stale with age). */
	async init(): Promise<void> {
		const s = await loadState();
		for (const id of PROVIDER_IDS) {
			const last = s.lastSub[id];
			if (last) this.views.get(id)!.sub = { ...last, status: "stale", source: "stale", detail: "letzter bekannter Wert" };
			this.noteResets(id, last);
		}
		this.emit();
	}

	/**
	 * Subscription refresh through the shared gate (55 s cache, cooldown after 429/5xx, last-good fallback).
	 * `force` skips the 55 s cache (rate-limited to one forced fetch per 30 s per provider), never a cooldown.
	 */
	async refreshSub(ids: ProviderId[] = PROVIDER_IDS, opts: { force?: boolean } = {}): Promise<void> {
		this.lastSubRefresh = Date.now();
		await Promise.all(
			ids.map(async (id) => {
				const res = await gatedSub(id, { force: opts.force });
				const view = this.views.get(id)!;
				const prev = view.sub;
				// The gate falls back to state.json's last good value; this covers a value only held in memory.
				if (!res.primary && prev?.primary && (res.status === "error" || res.status === "offline")) {
					view.sub = { ...prev, status: "stale", source: "stale", detail: res.detail, httpCode: res.httpCode, cooldownUntil: res.cooldownUntil };
				} else {
					view.sub = res;
				}
				this.noteResets(id, view.sub);
				this.emit();
			}),
		);
	}

	/** Collectors run sequentially (they share state.json and the disk). */
	async refreshTokens(ids: ProviderId[] = PROVIDER_IDS): Promise<void> {
		for (const id of ids) {
			const view = this.views.get(id)!;
			view.today = (await PROVIDERS[id].localTokens(startOfToday().toISOString())).tokens;
			view.week = (await PROVIDERS[id].localTokens(startOfWeek().toISOString())).tokens;
			this.emit();
		}
	}

	async refreshApi(ids: ProviderId[] = PROVIDER_IDS): Promise<void> {
		await Promise.all(
			ids.map(async (id) => {
				const res = (await PROVIDERS[id].apiCost(startOfMonth().toISOString())).api!;
				const view = this.views.get(id)!;
				const prev = view.api;
				view.api = (res.status === "offline" || res.status === "error") && prev?.usd !== undefined ? { ...prev, status: res.status, detail: res.detail } : res;
				this.emit();
			}),
		);
		await withState((s) => {
			s.lastApiRun = new Date().toISOString();
		}).catch(() => undefined);
	}

	async refreshAll(ids: ProviderId[] = PROVIDER_IDS, opts: { force?: boolean } = {}): Promise<void> {
		await Promise.all([this.refreshSub(ids, opts), this.refreshApi(ids), this.refreshTokens(ids)]);
	}
}
