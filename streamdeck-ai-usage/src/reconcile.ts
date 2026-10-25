import { isoWeek, lastSundaySlot, startOfMonth, startOfWeek } from "./format.js";
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from "./providers/index.js";
import { appendHistory, loadState, tryLock, withState } from "./store.js";

export interface HistoryLine {
	ts: string;
	week: string;
	provider: ProviderId;
	sub_pct: number | null;
	sub_reset: string | null;
	tokens_week_in: number | null;
	tokens_week_out: number | null;
	tokens_week_cached: number | null;
	api_usd_mtd: number | null;
	status: string;
}

export type ReconcileResult = { ran: true; lines: HistoryLine[] } | { ran: false; reason: string };

/**
 * Full weekly reconcile: subscription + week tokens + month-to-date API cost for every provider,
 * one history.jsonl line each. `scheduled` skips if this Sunday-20:00 slot was already done
 * (plugin and launchd both trigger it).
 */
export async function reconcile(opts: { scheduled?: boolean; api?: ProviderId[] } = {}): Promise<ReconcileResult> {
	const release = await tryLock();
	if (!release) return { ran: false, reason: "anderer Abgleich läuft (Lock)" };
	try {
		if (opts.scheduled) {
			const s = await loadState();
			if (s.lastReconcile && Date.parse(s.lastReconcile) >= lastSundaySlot().getTime()) {
				return { ran: false, reason: "dieser Sonntag-Slot ist bereits abgeglichen" };
			}
		}
		// API-key costs only for providers switched on (setting showApiCost → state.apiProviders, or sync --api).
		const apiIds = new Set(opts.api ?? (await loadState()).apiProviders ?? []);
		const now = new Date();
		const weekIso = startOfWeek(now).toISOString();
		const monthIso = startOfMonth(now).toISOString();
		const lines: HistoryLine[] = [];
		for (const id of PROVIDER_IDS) {
			const p = PROVIDERS[id];
			const [sub, api] = await Promise.all([p.subscription(), apiIds.has(id) ? p.apiCost(monthIso) : undefined]);
			const tok = await p.localTokens(weekIso);
			const s = sub.sub!;
			const t = tok.tokens!;
			const a = api?.api;
			const tOk = t.status === "ok";
			lines.push({
				ts: now.toISOString(),
				week: isoWeek(now),
				provider: id,
				sub_pct: s.primary && s.primary.text === undefined ? s.primary.pct : null,
				sub_reset: s.primary?.resetAt ?? null,
				tokens_week_in: tOk ? t.in : null,
				tokens_week_out: tOk ? t.out : null,
				tokens_week_cached: tOk ? t.cached : null,
				api_usd_mtd: a?.usd ?? null,
				status: `sub:${s.status} tokens:${t.status} api:${a ? a.status : "aus"}`,
			});
		}
		await appendHistory(lines);
		await withState((s) => {
			s.lastReconcile = now.toISOString();
		});
		return { ran: true, lines };
	} finally {
		await release();
	}
}
