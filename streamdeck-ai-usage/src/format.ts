const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day "YYYY-MM-DD". */
export function localDay(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function startOfToday(now = new Date()): Date {
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday 00:00 local of the week containing `now`. */
export function startOfWeek(now = new Date()): Date {
	const d = startOfToday(now);
	const dow = (d.getDay() + 6) % 7; // Monday = 0
	d.setDate(d.getDate() - dow);
	return d;
}

export function startOfMonth(now = new Date()): Date {
	return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** ISO-8601 week label, e.g. "2026-W43". */
export function isoWeek(now = new Date()): string {
	const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
	const day = d.getUTCDay() || 7;
	d.setUTCDate(d.getUTCDate() + 4 - day);
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
	return `${d.getUTCFullYear()}-W${pad(week)}`;
}

/** Most recent Sunday 20:00 local at or before `now`. */
export function lastSundaySlot(now = new Date()): Date {
	const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
	d.setDate(d.getDate() - d.getDay()); // back to Sunday
	if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 7);
	return d;
}

const comma = (s: string) => s.replace(".", ",");

export function fmtPct(p: number): string {
	return `${Math.round(p)}%`;
}

export function fmtTokens(n: number): string {
	if (n < 1000) return String(Math.round(n));
	if (n < 1e6) return comma((n / 1e3).toFixed(n < 1e4 ? 1 : 0)) + "k";
	if (n < 1e9) return comma((n / 1e6).toFixed(n < 1e7 ? 1 : 0)) + "M";
	return comma((n / 1e9).toFixed(1)) + "G";
}

export function fmtUsd(n: number): string {
	return "$ " + comma(n.toFixed(2));
}

function span(ms: number): string {
	const m = Math.max(0, Math.round(ms / 60_000));
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 48) return `${h}h${pad(m % 60)}`;
	return `${Math.floor(h / 24)}d${h % 24}h`;
}

/** "↻ 2h14" until reset. */
export function fmtCountdown(resetIso: string, now = Date.now()): string {
	const t = Date.parse(resetIso);
	if (!Number.isFinite(t)) return "";
	return "↻ " + span(t - now);
}

/** "vor 3h" since `iso`. */
export function fmtAge(iso: string, now = Date.now()): string {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return "";
	const m = Math.round((now - t) / 60_000);
	if (m < 1) return "jetzt";
	if (m < 60) return `vor ${m}m`;
	const h = Math.round(m / 60);
	if (h < 48) return `vor ${h}h`;
	return `vor ${Math.round(h / 24)}d`;
}

/** "4m", "1h05" — remaining wait, rounded up to whole minutes (at least 1m). */
export function fmtWait(ms: number): string {
	const m = Math.max(1, Math.ceil(ms / 60_000));
	if (m < 60) return `${m}m`;
	return `${Math.floor(m / 60)}h${pad(m % 60)}`;
}
