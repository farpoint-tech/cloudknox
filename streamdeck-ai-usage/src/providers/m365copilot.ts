import { execFile } from "node:child_process";
import { getJson, num, pick, type HttpResult } from "../http.js";
import { isoOrUndefined } from "../resets.js";
import { loadState } from "../store.js";
import { httpStatus } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, tokensOnly, type CostItem, type M365Activity, type Provider, type ResetEvent, type SubPart } from "./types.js";

/**
 * Microsoft 365 Copilot license via Microsoft Graph, token from the az CLI (no own app registration, no secret stored).
 * Calls (all GET, each degrades on its own; only the license call decides the status):
 *  1. /v1.0/me/licenseDetails            → license yes/no + SKU
 *  2. /v1.0/directory/subscriptions      → renewal (ResetEvent "Verlängerung") + license count; 403 is quiet
 *  3. /v1.0/me                           → UPN for the report row
 *  4. Copilot usage report (D30)         → apps with activity; 403 = Reports.Read.All missing
 */

export const M365_TENANT_ENV = "AI_USAGE_DECK_M365_TENANT";
export const GRAPH = "https://graph.microsoft.com";
export const AZ_TIMEOUT_MS = 20_000;
/** az is usually Homebrew; launchd and Stream Deck do not inherit the shell PATH. */
export const AZ_EXTRA_PATH = ["/opt/homebrew/bin", "/usr/local/bin"];

/** Requested report URL; documented JSON variant (beta) as fallback when v1.0 answers 400/404. */
export const REPORT_URLS = [
	`${GRAPH}/v1.0/reports/getMicrosoft365CopilotUsageUserDetail(period='D30')?$format=application/json`,
	`${GRAPH}/beta/reports/getMicrosoft365CopilotUsageUserDetail(period='D30')?$format=application/json`,
];
const REPORT_MAX_PAGES = 20;
/** Report data refreshes daily; renewal dates rarely change. Cache per process and tenant. */
const SLOW_TTL_MS = 30 * 60_000;

export function azLoginHint(tenant: string): string {
	return `az login --tenant ${tenant} --scope https://graph.microsoft.com//.default`;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Tenant GUID or domain, trimmed; undefined when empty or not a tenant (never passed to az then). */
export function normalizeTenant(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const t = v.trim();
	return GUID.test(t) || DOMAIN.test(t) ? t.toLowerCase() : undefined;
}

/** Tenant from the key setting (state.json), else the env fallback. `raw` is set when a value exists but is invalid. */
export async function resolveTenant(): Promise<{ tenant?: string; raw?: string }> {
	const s = await loadState().catch(() => undefined);
	const raw = (s?.m365TenantId || process.env[M365_TENANT_ENV] || "").trim();
	if (!raw) return {};
	const tenant = normalizeTenant(raw);
	return tenant ? { tenant } : { raw };
}

export type AzToken = { status: "found"; token: string } | { status: "login" | "missing" | "error"; detail: string };

/** Runs a command with stdout/stderr; tests replace it. */
export type Runner = (file: string, args: string[], timeoutMs: number) => Promise<{ ok: boolean; stdout: string; stderr: string; code?: string | number; timedOut?: boolean }>;

export const runAz: Runner = (file, args, timeoutMs) =>
	new Promise((resolve) => {
		const env = { ...process.env, PATH: [process.env.PATH ?? "", ...AZ_EXTRA_PATH].filter(Boolean).join(":") };
		execFile(file, args, { timeout: timeoutMs, env, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
			const e = err as (NodeJS.ErrnoException & { killed?: boolean; signal?: string }) | null;
			resolve({ ok: !e, stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), code: e?.code, timedOut: !!e && (e.killed === true || e.signal === "SIGTERM") });
		});
	});

/** Graph token for `tenant` from the az CLI cache. Never logs or returns stderr text verbatim (only AADSTS codes). */
export async function readAzGraphToken(tenant: string, run: Runner = runAz): Promise<AzToken> {
	const args = ["account", "get-access-token", "--tenant", tenant, "--resource-type", "ms-graph", "--query", "accessToken", "-o", "tsv"];
	const r = await run("az", args, AZ_TIMEOUT_MS);
	if (r.ok) {
		const token = r.stdout.trim();
		if (/^ey[\w-]+\.[\w-]+\.[\w-]*$/.test(token)) return { status: "found", token };
		return { status: "error", detail: "az: unerwartete Ausgabe (kein Token)" };
	}
	if (r.code === "ENOENT") return { status: "missing", detail: "az CLI fehlt (brew install azure-cli)" };
	if (r.timedOut) return { status: "error", detail: `az: keine Antwort in ${AZ_TIMEOUT_MS / 1000} s` };
	const aad = r.stderr.match(/AADSTS\d+/)?.[0];
	return { status: "login", detail: aad ? `${azLoginHint(tenant)} (${aad})` : azLoginHint(tenant) };
}

/** True for a Copilot SKU part number (e.g. "Microsoft_365_Copilot"). */
export function isCopilotSku(sku: unknown): sku is string {
	return typeof sku === "string" && sku.toUpperCase().includes("COPILOT");
}

/** Copilot SKUs among /me/licenseDetails `value[]`. */
export function copilotSkus(json: unknown): string[] {
	const v = pick(json, "value");
	if (!Array.isArray(v)) return [];
	return [...new Set(v.map((x) => pick(x, "skuPartNumber")).filter(isCopilotSku))];
}

/** "Microsoft_365_Copilot" → "M365 Copilot" for the key (the CLI keeps the raw SKU). */
export function shortSku(sku: string | undefined): string | undefined {
	if (!sku) return undefined;
	const s = sku.split(",")[0].trim().replace(/_/g, " ").replace(/^Microsoft 365\b/i, "M365");
	return s.length > 16 ? s.slice(0, 15) + "…" : s;
}

export interface Renewal {
	resetsAt?: string;
	/** Sum of totalLicenses of the matched Copilot subscriptions. */
	licenses?: number;
	skus: string[];
}

/**
 * Copilot subscriptions of /directory/subscriptions `value[]`. Prefers the user's own SKUs; renewal = soonest
 * future nextLifecycleDateTime of an enabled (or status-less) subscription.
 */
export function copilotRenewal(json: unknown, userSkus: string[] = [], now = Date.now()): Renewal {
	const v = pick(json, "value");
	if (!Array.isArray(v)) return { skus: [] };
	const all = v.filter((x) => isCopilotSku(pick(x, "skuPartNumber")));
	const mine = all.filter((x) => userSkus.some((u) => u.toLowerCase() === String(pick(x, "skuPartNumber")).toLowerCase()));
	const subs = mine.length ? mine : all;
	if (!subs.length) return { skus: [] };
	const live = subs.filter((x) => {
		const st = pick(x, "status");
		return st === undefined || st === null || String(st).toLowerCase() === "enabled";
	});
	const dates = (live.length ? live : subs)
		.map((x) => isoOrUndefined(pick(x, "nextLifecycleDateTime")))
		.filter((d): d is string => !!d && Date.parse(d) > now)
		.sort();
	const counts = subs.map((x) => num(pick(x, "totalLicenses"))).filter((n): n is number => n !== undefined);
	return {
		resetsAt: dates[0],
		licenses: counts.length ? counts.reduce((a, b) => a + b, 0) : undefined,
		skus: [...new Set(subs.map((x) => String(pick(x, "skuPartNumber"))))],
	};
}

/** Report fields → app names shown on the key. */
export const ACTIVITY_FIELDS: [string, string][] = [
	["microsoftTeamsCopilotLastActivityDate", "Teams"],
	["wordCopilotLastActivityDate", "Word"],
	["excelCopilotLastActivityDate", "Excel"],
	["powerPointCopilotLastActivityDate", "PowerPoint"],
	["outlookCopilotLastActivityDate", "Outlook"],
	["oneNoteCopilotLastActivityDate", "OneNote"],
	["loopCopilotLastActivityDate", "Loop"],
	["copilotChatLastActivityDate", "Chat"],
];

const DAY = 86_400_000;
const dateOnly = (v: unknown): string | undefined => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);

/**
 * Activity of one report row: apps whose last Copilot activity lies within 30 days before the report refresh date
 * (the "last activity" fields are lifetime values, so older dates are dropped).
 */
export function activityFromRow(row: unknown, now = Date.now()): M365Activity {
	const refresh = dateOnly(pick(row, "reportRefreshDate"));
	const ref = refresh ? Date.parse(`${refresh}T00:00:00Z`) : now;
	const from = ref - 30 * DAY;
	const apps = ACTIVITY_FIELDS.filter(([f]) => {
		const d = dateOnly(pick(row, f));
		return !!d && Date.parse(`${d}T00:00:00Z`) >= from;
	}).map(([, name]) => name);
	const out: M365Activity = { status: "ok", apps };
	const last = dateOnly(pick(row, "lastActivityDate"));
	if (last) out.lastActivity = last;
	if (refresh) out.refreshDate = refresh;
	return out;
}

/** Hashed names (32 hex chars) = report concealment is on. */
const CONCEALED = /^[0-9A-F]{32}$/i;

/** Finds the UPN's row in one report page. `concealed` when no match and every UPN is a hash. */
export function findReportRow(json: unknown, upn: string): { row?: unknown; concealed: boolean; rows: number } {
	const v = pick(json, "value");
	if (!Array.isArray(v)) return { concealed: false, rows: 0 };
	const want = upn.toLowerCase();
	const row = v.find((x) => String(pick(x, "userPrincipalName") ?? "").toLowerCase() === want);
	const concealed = !row && v.length > 0 && v.every((x) => CONCEALED.test(String(pick(x, "userPrincipalName") ?? "")));
	return { row, concealed, rows: v.length };
}

type Get = (url: string) => Promise<HttpResult>;

/** Walks the report pages (only graph.microsoft.com nextLinks, the bearer token never leaves Graph). */
export async function reportActivity(get: Get, upn: string, now = Date.now()): Promise<M365Activity> {
	let res: HttpResult | undefined;
	for (const url of REPORT_URLS) {
		res = await get(url);
		if (!(res.kind === "http" && (res.status === 400 || res.status === 404))) break;
	}
	let concealedAll = true;
	let rows = 0;
	for (let page = 0; res && page < REPORT_MAX_PAGES; page++) {
		if (res.kind === "offline") return { status: "error", apps: [], detail: `Nutzung: offline` };
		if (res.kind === "http") {
			if (res.status === 403 || res.status === 401) return { status: "forbidden", apps: [], detail: "Nutzung: keine Berechtigung" };
			return { status: "error", apps: [], detail: `Nutzung: HTTP ${res.status}` };
		}
		const f = findReportRow(res.json, upn);
		rows += f.rows;
		if (f.row) return activityFromRow(f.row, now);
		if (!f.concealed && f.rows > 0) concealedAll = false;
		const next = pick(res.json, "@odata.nextLink");
		if (typeof next !== "string" || !next.startsWith(`${GRAPH}/`)) break;
		res = await get(next);
	}
	if (rows > 0 && concealedAll) return { status: "concealed", apps: [], detail: "Nutzung: Bericht anonymisiert (Namen im Admin Center einblenden)" };
	return { status: "none", apps: [], detail: "Nutzung: kein Eintrag im Bericht" };
}

/** License cost item: SKU count from the subscriptions, renewal as reset; info only (no spending). */
export function licenseCost(r: Renewal | undefined): CostItem[] | undefined {
	if (!r || r.licenses === undefined) return undefined;
	const c: CostItem = { label: "Lizenz", used: r.licenses, info: true };
	if (r.resetsAt) c.resetAt = r.resetsAt;
	return [c];
}

export function renewalResets(r: Renewal | undefined): ResetEvent[] {
	return r?.resetsAt ? [{ provider: "m365copilot", window: "Verlängerung", resetsAt: r.resetsAt }] : [];
}

/** Assembles the SubPart from the independent call results (pure; tested with fixtures). */
export function buildM365Sub(
	parts: {
		license: HttpResult;
		subscriptions?: HttpResult;
		activity?: M365Activity;
	},
	tenant: string,
	fetchedAt = nowIso(),
	now = Date.now(),
): SubPart {
	if (parts.license.kind !== "ok") {
		const h = httpStatus(parts.license);
		return { ...h, detail: h.status === "login" ? azLoginHint(tenant) : h.detail, fetchedAt };
	}
	const skus = copilotSkus(parts.license.json);
	const notes: string[] = [];
	let renewal: Renewal | undefined;
	const sr = parts.subscriptions;
	if (sr?.kind === "ok") renewal = copilotRenewal(sr.json, skus, now);
	else if (sr?.kind === "http" && (sr.status === 403 || sr.status === 401)) notes.push("Verlängerung: keine Berechtigung");
	else if (sr) notes.push(`Verlängerung: ${sr.kind === "offline" ? "offline" : `HTTP ${sr.status}`}`);
	if (parts.activity?.detail) notes.push(parts.activity.detail);
	const sub: SubPart = {
		status: "ok",
		primary: { label: "Lizenz", pct: 0, text: skus.length ? "ja" : "nein", ...(renewal?.resetsAt ? { resetAt: renewal.resetsAt } : {}) },
		resets: renewalResets(renewal),
		fetchedAt,
	};
	if (skus.length) sub.plan = skus.join(", ");
	const cost = licenseCost(renewal);
	if (cost) sub.cost = cost;
	if (parts.activity) sub.activity = parts.activity;
	if (notes.length) sub.detail = notes.join("; ");
	return sub;
}

const slowCache = new Map<string, { at: number; subscriptions: HttpResult; activity: M365Activity }>();

/** Test hook. */
export function clearM365Cache(): void {
	slowCache.clear();
}

export const m365copilot: Provider = {
	id: "m365copilot",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const t = await resolveTenant();
			if (!t.tenant) {
				const detail = t.raw ? "tenantId ungültig (GUID oder Domain)" : `tenantId fehlt (Taste-Einstellung oder ${M365_TENANT_ENV})`;
				return subOnly("m365copilot", { status: "config", detail, fetchedAt });
			}
			const tenant = t.tenant;
			const tok = await readAzGraphToken(tenant);
			if (tok.status !== "found") return subOnly("m365copilot", { status: tok.status === "login" ? "login" : "error", detail: tok.detail, fetchedAt });
			const h = { Authorization: `Bearer ${tok.token}` };
			const get: Get = (url) => getJson(url, h, { timeoutMs: 20_000 });
			const license = await get(`${GRAPH}/v1.0/me/licenseDetails?$select=skuPartNumber,skuId`);
			if (license.kind !== "ok") return subOnly("m365copilot", buildM365Sub({ license }, tenant, fetchedAt));
			let slow = slowCache.get(tenant);
			if (!slow || Date.now() - slow.at > SLOW_TTL_MS) {
				const [subscriptions, me] = await Promise.all([
					get(`${GRAPH}/v1.0/directory/subscriptions?$select=skuPartNumber,nextLifecycleDateTime,totalLicenses,status`),
					get(`${GRAPH}/v1.0/me?$select=userPrincipalName`),
				]);
				const upn = me.kind === "ok" ? pick(me.json, "userPrincipalName") : undefined;
				const activity: M365Activity =
					typeof upn === "string" && upn
						? await reportActivity(get, upn)
						: { status: "error", apps: [], detail: me.kind === "ok" ? "Nutzung: UPN fehlt" : `Nutzung: /me ${me.kind === "http" ? `HTTP ${me.status}` : "offline"}` };
				slow = { at: Date.now(), subscriptions, activity };
				// Cache only complete answers; a transient failure is retried next round.
				if (subscriptions.kind !== "offline" && activity.status !== "error") slowCache.set(tenant, slow);
			}
			return subOnly("m365copilot", buildM365Sub({ license, subscriptions: slow.subscriptions, activity: slow.activity }, tenant, fetchedAt));
		}, (detail) => subOnly("m365copilot", { status: "error", detail, fetchedAt: nowIso() })),

	localTokens: async (sinceIso) =>
		tokensOnly("m365copilot", { status: "na", since: sinceIso, in: 0, out: 0, cached: 0, detail: "Microsoft veröffentlicht keine Token-Zahlen", fetchedAt: nowIso() }),

	apiCost: async (monthStartIso) => apiOnly("m365copilot", { status: "na", month: monthLabel(monthStartIso), detail: "keine API-Kosten", fetchedAt: nowIso() }),
};
