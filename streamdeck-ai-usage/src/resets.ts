import { PROVIDER_IDS, type ProviderId, type ResetEvent, type SubPart } from "./providers/types.js";

/** Default for the "Nächste Resets" key: blink when more than BLINK_MIN_EVENTS resets fall within this many hours. */
export const DEFAULT_BLINK_WINDOW_HOURS = 24;
/** The key blinks when MORE than this many resets fall within the blink window. */
export const BLINK_MIN_EVENTS = 2;
/** Number of resets drawn on the key. */
export const SHOWN_EVENTS = 2;

export const PROVIDER_DISPLAY: Record<ProviderId, string> = {
	claude: "Claude",
	codex: "Codex",
	copilot: "GH Copilot",
	m365copilot: "M365 Copilot",
	gemini: "Gemini",
	grok: "Grok",
};

const WEEKDAY = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Window name from a window length in seconds: "5h", "Woche", "Monat". */
export function resetWindowName(seconds: number | undefined): string {
	if (!seconds) return "?";
	if (seconds <= 24 * 3600) return `${Math.round(seconds / 3600)}h`;
	if (seconds <= 8 * 86400) return "Woche";
	return "Monat";
}

/** Normalises any parseable time to ISO; undefined when not a time. */
export function isoOrUndefined(v: unknown): string | undefined {
	if (typeof v !== "string" || !v) return undefined;
	const t = Date.parse(v);
	return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

/** Window label of a SubPart window ("5h", "Wo", "Mo", Copilot "Prem"/"Chat"/"Code") as reset window name. */
function windowFromLabel(label: string): string {
	if (/^\d+h$/.test(label)) return label;
	if (label === "Wo") return "Woche";
	return "Monat"; // "Mo", Copilot quota labels (monthly), Grok credits
}

/**
 * Resets of a SubPart: its `resets` list, or (state.json written before resets existed) derived from
 * the primary/secondary windows. Same window + same time counts once.
 */
export function resetsOf(provider: ProviderId, sub: SubPart | undefined): ResetEvent[] {
	if (!sub) return [];
	if (sub.resets) return sub.resets;
	const out: ResetEvent[] = [];
	for (const w of [sub.primary, sub.secondary]) {
		const at = isoOrUndefined(w?.resetAt);
		if (!w || !at) continue;
		const window = windowFromLabel(w.label);
		if (out.some((e) => e.window === window && e.resetsAt === at)) continue;
		out.push({ provider, window, resetsAt: at, pct: w.pct });
	}
	return out;
}

/** Future resets only (strictly after `now`), soonest first; ties ordered by provider, then window. */
export function upcomingResets(events: ResetEvent[], now = Date.now()): ResetEvent[] {
	return events
		.filter((e) => {
			const t = Date.parse(e.resetsAt);
			return Number.isFinite(t) && t > now;
		})
		.sort(
			(a, b) =>
				Date.parse(a.resetsAt) - Date.parse(b.resetsAt) ||
				PROVIDER_IDS.indexOf(a.provider) - PROVIDER_IDS.indexOf(b.provider) ||
				a.window.localeCompare(b.window),
		);
}

/** Valid blink window in hours (setting may arrive as string from the property inspector). */
export function normalizeBlinkHours(v: unknown): number {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
	if (!Number.isFinite(n) || n <= 0) return DEFAULT_BLINK_WINDOW_HOURS;
	return Math.min(24 * 31, n);
}

export interface BlinkInfo {
	/** Resets within (now, now + windowHours]. */
	inWindow: number;
	/** inWindow > BLINK_MIN_EVENTS. */
	blink: boolean;
}

/** Blink condition: more than two resets within the next `windowHours`. */
export function blinkInfo(events: ResetEvent[], now: number, windowHours: number): BlinkInfo {
	const end = now + windowHours * 3600_000;
	const inWindow = events.filter((e) => {
		const t = Date.parse(e.resetsAt);
		return t > now && t <= end;
	}).length;
	return { inWindow, blink: inWindow > BLINK_MIN_EVENTS };
}

/** The two soonest resets plus the number of further ones (for the "+N" badge). */
export function topResets(events: ResetEvent[], now = Date.now()): { shown: ResetEvent[]; hidden: number } {
	const up = upcomingResets(events, now);
	return { shown: up.slice(0, SHOWN_EVENTS), hidden: Math.max(0, up.length - SHOWN_EVENTS) };
}

/** "in 13m", "in 2h 13m", "in 3d 4h" (rounded down); "in <1m" in the last minute. */
export function fmtResetCountdown(resetIso: string, now = Date.now()): string {
	const t = Date.parse(resetIso);
	if (!Number.isFinite(t)) return "";
	const min = Math.floor((t - now) / 60_000);
	if (min < 1) return "in <1m";
	if (min < 60) return `in ${min}m`;
	const h = Math.floor(min / 60);
	if (h < 24) return `in ${h}h ${min % 60}m`;
	return `in ${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Local time of the reset: "So 21:00" within the next 6 days, else "Mi 01.11.". */
export function fmtResetLocal(resetIso: string, now = Date.now()): string {
	const t = Date.parse(resetIso);
	if (!Number.isFinite(t)) return "";
	const d = new Date(t);
	const wd = WEEKDAY[d.getDay()];
	if (t - now < 6 * 86_400_000) return `${wd} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
	return `${wd} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** Full local time for the CLI: "So 25.10. 21:00". */
export function fmtResetFull(resetIso: string): string {
	const d = new Date(resetIso);
	return `${WEEKDAY[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
