import { startOfMonth, startOfToday, startOfWeek } from "./format.js";
import { PROVIDERS, PROVIDER_IDS, type ApiPart, type ProviderId, type ResetEvent, type SubPart, type TokenPart } from "./providers/index.js";
import { resetsOf, upcomingResets } from "./resets.js";
import { loadState, withState } from "./store.js";
import { gatedSub } from "./subgate.js";
import { normalizeTenant } from "./providers/m365copilot.js";

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
	/**
	 * Providers whose API-key costs are fetched (setting showApiCost, CLI --api). Empty by default: personal
	 * subscriptions have no admin keys, and keychain services are only probed for providers in this set.
	 */
	apiProviders = new Set<ProviderId>();

	/**
	 * Replaces the set of API-cost providers. Providers switched off lose their API value; newly switched-on ones
	 * are fetched. `persist` stores the set in state.json for the weekly reconcile (plugin only).
	 */
	async setApiProviders(ids: Iterable<ProviderId>, opts: { persist?: boolean } = {}): Promise<void> {
		const next = new Set(ids);
		const added = [...next].filter((id) => !this.apiProviders.has(id));
		const changed = added.length > 0 || [...this.apiProviders].some((id) => !next.has(id));
		this.apiProviders = next;
		if (!changed) return;
		for (const id of PROVIDER_IDS) if (!next.has(id)) delete this.views.get(id)!.api;
		this.emit();
		if (opts.persist) {
			await withState((s) => {
				s.apiProviders = PROVIDER_IDS.filter((id) => next.has(id));
			}).catch(() => undefined);
		}
		if (added.length) await this.refreshApi(added);
	}

	/**
	 * Stores the M365 Copilot tenant from a provider-key setting in state.json (shared with CLI and reconcile).
	 * A changed tenant drops the old tenant's last value, cooldown and resets, then fetches anew.
	 * Invalid values are ignored here; the provider reports them as status "config".
	 */
	async setM365Tenant(raw: string, opts: { refresh?: boolean } = {}): Promise<void> {
		const tenant = normalizeTenant(raw);
		if (!tenant) return;
		const changed = await withState((s) => {
			if (s.m365TenantId === tenant) return false;
			s.m365TenantId = tenant;
			delete s.lastSub.m365copilot;
			delete s.subGate.m365copilot;
			return true;
		});
		if (!changed) return;
		this.resetsBy.delete("m365copilot");
		delete this.views.get("m365copilot")!.sub;
		this.emit();
		if (opts.refresh !== false) await this.refreshSub(["m365copilot"]);
	}

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

	/** API-key costs, only for providers in apiProviders (no keychain access otherwise). */
	async refreshApi(ids: ProviderId[] = PROVIDER_IDS): Promise<void> {
		const enabled = ids.filter((id) => this.apiProviders.has(id));
		if (enabled.length === 0) return;
		await Promise.all(
			enabled.map(async (id) => {
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
