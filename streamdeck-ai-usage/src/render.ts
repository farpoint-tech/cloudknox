import { COST_SOURCE, costAmount, costLabel, costNotable, primaryCost } from "./cost.js";
import { fmtAge, fmtCountdown, fmtPct, fmtTokens, fmtUsd, fmtWait } from "./format.js";
import type { View } from "./hub.js";
import { META, PROVIDER_IDS, type ProviderId, type ResetEvent, type Status, type SubPart, type Window } from "./providers/types.js";
import { normalizeTenant, shortSku } from "./providers/m365copilot.js";
import { normalizeAuth, normalizeClientId, normalizeUpn, type M365Auth } from "./providers/m365app.js";
import { fmtResetCountdown, fmtResetLocal, PROVIDER_DISPLAY } from "./resets.js";

/** "kosten" = subscription costs/budgets (default); "api" = API-key costs, only with showApiCost (Enterprise/Teams). */
export type Metric = "auto" | "sub" | "tokens" | "kosten" | "api";
export const METRICS: Metric[] = ["auto", "sub", "tokens", "kosten"];

/** Metric cycle of a key: "api" only when the key has showApiCost switched on. */
export function metricsFor(showApiCost: boolean): Metric[] {
	return showApiCost ? [...METRICS, "api"] : METRICS;
}

export type ProviderSettings = {
	provider?: ProviderId;
	metric?: Metric;
	/** API-key costs (admin keys, only Enterprise/Teams). Off by default: no keychain access for API keys. */
	showApiCost?: boolean;
	/** M365 Copilot only: Entra tenant (GUID or domain). "" = not set. */
	tenantId?: string;
	/** M365 Copilot only: "az" (az CLI token, default) or "app" (Entra app, client credentials). */
	m365Auth?: M365Auth;
	/** M365 Copilot app mode: application (client) ID (GUID). "" = not set. */
	clientId?: string;
	/** M365 Copilot app mode: user whose license and usage are shown (app tokens have no /me). "" = not set. */
	upn?: string;
};

/** Settings from the property inspector; "api" without showApiCost (and the old default "api") becomes "kosten". */
export function normalizeProviderSettings(s: ProviderSettings): Required<ProviderSettings> {
	const showApiCost = s.showApiCost === true || (s.showApiCost as unknown) === "true";
	const metrics = metricsFor(showApiCost);
	const metric: Metric = metrics.includes(s.metric as Metric) ? (s.metric as Metric) : s.metric === "api" ? "kosten" : "auto";
	return {
		provider: PROVIDER_IDS.includes(s.provider as ProviderId) ? (s.provider as ProviderId) : "claude",
		metric,
		showApiCost,
		tenantId: normalizeTenant(s.tenantId) ?? (typeof s.tenantId === "string" ? s.tenantId.trim() : ""),
		m365Auth: normalizeAuth(s.m365Auth),
		clientId: normalizeClientId(s.clientId) ?? (typeof s.clientId === "string" ? s.clientId.trim() : ""),
		upn: normalizeUpn(s.upn) ?? (typeof s.upn === "string" ? s.upn.trim() : ""),
	};
}

export const STATUS_TEXT: Record<Status, string> = {
	ok: "ok",
	login: "login",
	key_missing: "Key fehlt",
	offline: "offline",
	na: "n/v",
	error: "Fehler",
	stale: "veraltet",
	config: "Setup fehlt",
};

/** Value of a window: its text (M365 license "ja"/"nein") or the percentage. */
export function windowValue(w: Window): string {
	return w.text ?? fmtPct(w.pct);
}

/** Short hint for a provider without value (M365: "az login", "Tenant-ID"; Grok: "grok login"). */
function hintFor(id: ProviderId, s: SubPart): string {
	if (s.hint) return s.hint;
	if (id !== "m365copilot") return "";
	if (s.status === "login") return "az login";
	if (s.status === "config") return "Tenant-ID";
	return "";
}

/** "2026-10-24" → "24.10." */
function dayMonth(d: string): string {
	const [, m, day] = d.split("-");
	return `${day}.${m}.`;
}

/** Fits a list into `max` characters: "Teams, Word, Ou…". */
function fit(text: string, max: number): string {
	return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export interface Tile {
	title: string;
	color: string;
	big: string;
	small: string;
	barPct?: number;
	bottom: string;
	dim: boolean;
	/** Small hourglass in the top-right corner: endpoint in cooldown after 429/5xx. */
	cooldown?: boolean;
}

/** True while the subscription endpoint must not be called (cooldown after 429/5xx). */
export function inCooldown(s: { cooldownUntil?: string } | undefined, now = Date.now()): boolean {
	const t = s?.cooldownUntil ? Date.parse(s.cooldownUntil) : NaN;
	return Number.isFinite(t) && t > now;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function barColor(p: number): string {
	return p >= 90 ? "#E5484D" : p >= 70 ? "#F5A524" : "#30A46C";
}

/** Which metric "auto" resolves to. */
export function resolveMetric(view: View, metric: Metric): Exclude<Metric, "auto"> {
	if (metric !== "auto") return metric;
	if (view.sub?.primary) return "sub";
	if (view.today?.status === "ok") return "tokens";
	if (view.sub?.cost?.length) return "kosten";
	return "sub";
}

export function tileFor(id: ProviderId, view: View, metric: Metric, now = Date.now()): Tile {
	const m = META[id];
	const base = { title: m.name, color: m.color, dim: false };
	const which = resolveMetric(view, metric);
	if (which === "sub") {
		const s = view.sub;
		if (!s) return { ...base, big: "…", small: "Abo", bottom: "", dim: true };
		const cooldown = inCooldown(s, now);
		if (!s.primary) {
			// Never had a good value: only now is "Fehler" shown; with the retry time when in cooldown.
			const wait = cooldown ? `erneut ${fmtWait(Date.parse(s.cooldownUntil!) - now)}` : hintFor(id, s);
			return { ...base, big: STATUS_TEXT[s.status], small: s.httpCode === 429 ? "Abo · 429" : id === "m365copilot" ? "Lizenz" : "Abo", bottom: wait, dim: true, cooldown };
		}
		const p = s.primary;
		const fresh = s.status === "ok";
		const plan = id === "m365copilot" ? (shortSku(s.plan) ?? "M365") : s.plan;
		return {
			...base,
			big: `${p.label} ${windowValue(p)}`.trim(),
			small: s.secondary ? `${s.secondary.label} ${windowValue(s.secondary)}` : (plan ?? "Abo"),
			barPct: p.text === undefined ? p.pct : undefined,
			// Stale value stays visible; "~" marks it, the bottom line gives its age.
			bottom: fresh ? (p.resetAt ? fmtCountdown(p.resetAt, now) : "") : `~ ${fmtAge(s.fetchedAt, now)}`,
			dim: !fresh,
			cooldown,
		};
	}
	if (which === "tokens") {
		if (id === "m365copilot") return activityTile(view, base, now);
		const t = view.today;
		const w = view.week;
		if (!t || t.status !== "ok") return { ...base, big: t ? STATUS_TEXT[t.status] : "…", small: "Tokens", bottom: "", dim: true };
		return {
			...base,
			big: fmtTokens(t.in + t.out),
			small: w?.status === "ok" ? `heute · Wo ${fmtTokens(w.in + w.out)}` : "heute",
			bottom: fmtAge(t.fetchedAt, now),
			dim: false,
		};
	}
	if (which === "kosten") return costTile(id, view, base, now);
	const a = view.api;
	if (!a) return { ...base, big: "…", small: "API", bottom: "", dim: true };
	if (a.usd === undefined) return { ...base, big: STATUS_TEXT[a.status], small: "API", bottom: "", dim: true };
	return { ...base, big: fmtUsd(a.usd), small: `API ${a.month}`, bottom: fmtAge(a.fetchedAt, now), dim: a.status !== "ok" };
}

/**
 * M365 Copilot has no token counts: the "tokens" slot shows the apps with Copilot activity in the last 30 days
 * (usage report) and the last activity date.
 */
function activityTile(view: View, base: { title: string; color: string; dim: boolean }, now: number): Tile {
	const s = view.sub;
	if (!s) return { ...base, big: "…", small: "Nutzung", bottom: "", dim: true };
	const a = s.activity;
	if (!a) return { ...base, big: s.primary ? STATUS_TEXT.na : STATUS_TEXT[s.status], small: "Nutzung", bottom: s.primary ? "" : hintFor("m365copilot", s), dim: true };
	const fresh = s.status === "ok";
	const age = fresh ? "" : `~ ${fmtAge(s.fetchedAt, now)}`;
	if (a.status === "forbidden") return { ...base, big: STATUS_TEXT.na, small: "Nutzung", bottom: "k. Berechtigung", dim: true };
	if (a.status === "concealed") return { ...base, big: STATUS_TEXT.na, small: "Nutzung", bottom: "anonymisiert", dim: true };
	if (a.status !== "ok") return { ...base, big: STATUS_TEXT.na, small: "Nutzung", bottom: a.status === "none" ? "kein Eintrag" : "Fehler", dim: true };
	return {
		...base,
		big: a.apps.length ? `${a.apps.length} App${a.apps.length === 1 ? "" : "s"}` : "inaktiv",
		small: a.apps.length ? fit(a.apps.join(", "), 17) : "30 Tage",
		bottom: age || (a.lastActivity ? `zuletzt ${dayMonth(a.lastActivity)}` : ""),
		dim: !fresh,
	};
}

/** "Kosten" tile: amount line (big), label/limit line, bar from utilization, reset or age at the bottom. */
function costTile(id: ProviderId, view: View, base: { title: string; color: string; dim: boolean }, now: number): Tile {
	const s = view.sub;
	if (!COST_SOURCE[id]) return { ...base, big: STATUS_TEXT.na, small: "Kosten", bottom: "", dim: true };
	if (!s) return { ...base, big: "…", small: "Kosten", bottom: "", dim: true };
	const items = s.cost ?? [];
	const c = primaryCost(items);
	if (!c) return { ...base, big: s.primary ? STATUS_TEXT.na : STATUS_TEXT[s.status], small: "Kosten", bottom: "", dim: true };
	const fresh = s.status === "ok";
	const more = items.length > 1 ? ` · +${items.length - 1}` : "";
	const when = fresh ? (c.resetAt ? fmtCountdown(c.resetAt, now) : "") : `~ ${fmtAge(s.fetchedAt, now)}`;
	const label = costLabel(c);
	return {
		...base,
		big: costAmount(c),
		small: label.length > 16 && c.state ? c.state : label,
		barPct: c.pct,
		bottom: (when + more).replace(/^ · /, ""),
		dim: !fresh,
		cooldown: inCooldown(s, now),
	};
}

export function svgTile(t: Tile): string {
	const bigSize = t.big.length <= 6 ? 34 : t.big.length <= 8 ? 28 : t.big.length <= 11 ? 22 : 18;
	const bar =
		t.barPct === undefined
			? ""
			: `<rect x="12" y="110" width="120" height="8" rx="4" fill="#2A2A2A"/>` +
				`<rect x="12" y="110" width="${Math.round(Math.min(100, Math.max(0, t.barPct)) * 1.2)}" height="8" rx="4" fill="${barColor(t.barPct)}"/>`;
	const fg = t.dim ? "#8A8A8A" : "#FFFFFF";
	const titleSize = t.title.length <= 10 ? 19 : 16;
	// Hourglass drawn as paths (no font glyph needed).
	const hourglass = t.cooldown
		? `<g fill="none" stroke="#F5A524" stroke-width="2" stroke-linejoin="round"><path d="M124 10h12M124 30h12M126 10l8 10-8 10M134 10l-8 10 8 10"/></g>`
		: "";
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">` +
		`<rect width="144" height="144" fill="#111111"/>` +
		`<rect x="0" y="0" width="144" height="5" fill="${t.color}"/>` +
		`<text x="72" y="30" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="${t.color}">${esc(t.title)}</text>` +
		hourglass +
		`<text x="72" y="76" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="${bigSize}" font-weight="700" fill="${fg}">${esc(t.big)}</text>` +
		`<text x="72" y="100" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#A0A0A0">${esc(t.small)}</text>` +
		bar +
		`<text x="72" y="138" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="#B8B8B8">${esc(t.bottom)}</text>` +
		`</svg>`
	);
}

/** Compact one-line value per provider for the overview key. */
export function overviewValue(view: View): { text: string; pct?: number; dim: boolean } {
	const s = view.sub;
	if (s?.primary) {
		const text = (s.status === "ok" ? "" : "~") + windowValue(s.primary);
		return s.primary.text === undefined ? { text, pct: s.primary.pct, dim: s.status !== "ok" } : { text, dim: s.status !== "ok" };
	}
	if (s && s.status !== "na") return { text: s.status === "key_missing" ? "Key" : s.status === "config" ? "Setup" : STATUS_TEXT[s.status], dim: true };
	if (view.today?.status === "ok") return { text: fmtTokens(view.today.in + view.today.out), dim: false };
	return { text: s ? STATUS_TEXT[s.status] : "…", dim: true };
}

/**
 * Cost row of the overview key, only when some provider used something or reached a limit:
 * "CL 251 / 250 $" (reached first, then non-zero), "+N" when more providers qualify.
 */
export function overviewCost(views: Map<ProviderId, View>): { text: string; alert: boolean } | undefined {
	const hits = PROVIDER_IDS.flatMap((id) => (views.get(id)?.sub?.cost ?? []).filter(costNotable).map((c) => ({ id, c })));
	if (hits.length === 0) return undefined;
	const first = hits.find((h) => h.c.reached) ?? hits[0];
	const more = hits.length > 1 ? ` +${hits.length - 1}` : "";
	return { text: `${META[first.id].abbr} ${costAmount(first.c)}${more}`, alert: hits.some((h) => h.c.reached) };
}

export function svgOverview(views: Map<ProviderId, View>): string {
	let rows = "";
	const cost = overviewCost(views);
	// One row per provider (six), plus the cost row when shown.
	const step = cost ? 19 : 22;
	const size = cost ? 14 : 16;
	const top = cost ? 17 : 20;
	PROVIDER_IDS.forEach((id, i) => {
		const y = top + i * step;
		const v = overviewValue(views.get(id) ?? {});
		const m = META[id];
		rows +=
			`<text x="10" y="${y}" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${m.color}">${m.abbr}</text>` +
			`<text x="134" y="${y}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="${size}" font-weight="700" fill="${v.dim ? "#8A8A8A" : "#FFFFFF"}">${esc(v.text)}</text>`;
		if (v.pct !== undefined) {
			rows +=
				`<rect x="10" y="${y + 3}" width="124" height="3" fill="#2A2A2A"/>` +
				`<rect x="10" y="${y + 3}" width="${Math.round(Math.min(100, Math.max(0, v.pct)) * 1.24)}" height="3" fill="${barColor(v.pct)}"/>`;
		}
	});
	if (cost) {
		const y = top + PROVIDER_IDS.length * step;
		rows +=
			`<rect x="10" y="${y - 14}" width="124" height="1" fill="#2A2A2A"/>` +
			`<text x="72" y="${y}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="${cost.alert ? "#F5A524" : "#FFFFFF"}">${esc(cost.text)}</text>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="#111111"/>${rows}</svg>`;
}

export interface ResetsFrame {
	/** The (at most two) soonest resets. */
	shown: ResetEvent[];
	/** Further upcoming resets, drawn as "+N" badge. */
	hidden: number;
	/** Alternate (amber) blink frame. */
	alt: boolean;
	/** Blink muted by long press. */
	muted: boolean;
}

const FONT = `font-family="Helvetica, Arial, sans-serif"`;

/** "Nächste Resets" key: two soonest resets (name, countdown, local time), "+N" badge, amber blink frame. */
export function svgResets(f: ResetsFrame, now = Date.now()): string {
	const bg = f.alt ? "#F5A524" : "#111111";
	const ink = f.alt ? "#111111" : "#FFFFFF";
	const sub = f.alt ? "#3A2A00" : "#B8B8B8";
	let body = "";
	body += `<text x="10" y="18" ${FONT} font-size="13" font-weight="700" fill="${f.alt ? "#111111" : "#A0A0A0"}">RESETS${f.muted ? " · stumm" : ""}</text>`;
	if (f.hidden > 0) {
		const label = `+${f.hidden}`;
		const w = 12 + label.length * 9;
		body +=
			`<rect x="${136 - w}" y="4" width="${w}" height="18" rx="9" fill="${f.alt ? "#111111" : "#F5A524"}"/>` +
			`<text x="${136 - w / 2}" y="18" text-anchor="middle" ${FONT} font-size="14" font-weight="700" fill="${f.alt ? "#F5A524" : "#111111"}">${esc(label)}</text>`;
	}
	if (f.shown.length === 0) {
		body += `<text x="72" y="82" text-anchor="middle" ${FONT} font-size="18" font-weight="700" fill="#8A8A8A">keine Resets</text>`;
	}
	f.shown.forEach((e, i) => {
		const y = 24 + i * 60;
		// Long names ("M365 Copilot Verlängerung") use the short label and a smaller font.
		const full = `${PROVIDER_DISPLAY[e.provider]} ${e.window}`;
		const name = full.length > 16 ? `${META[e.provider].abbr} ${e.window}` : full;
		const nameSize = name.length > 14 ? 13 : 16;
		if (i > 0) body += `<rect x="10" y="${y - 1}" width="124" height="1" fill="${f.alt ? "#C88410" : "#2A2A2A"}"/>`;
		body +=
			`<text x="10" y="${y + 17}" ${FONT} font-size="${nameSize}" font-weight="700" fill="${f.alt ? ink : META[e.provider].color}">${esc(name)}</text>` +
			`<text x="10" y="${y + 37}" ${FONT} font-size="18" font-weight="700" fill="${ink}">${esc(fmtResetCountdown(e.resetsAt, now))}</text>` +
			`<text x="10" y="${y + 54}" ${FONT} font-size="14" fill="${sub}">${esc(fmtResetLocal(e.resetsAt, now))}</text>`;
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144"><rect width="144" height="144" fill="${bg}"/>${body}</svg>`;
}

export function dataUrl(svg: string): string {
	return "data:image/svg+xml;base64," + Buffer.from(svg, "utf8").toString("base64");
}
