import { execFile } from "node:child_process";
import { getJson, num, pick, type HttpResult } from "../http.js";
import { isoOrUndefined } from "../resets.js";
import { loadState } from "../store.js";
import { httpStatus } from "./common.js";
import {
	APP_PERMISSIONS,
	keychainHint,
	M365_APP_KEYCHAIN,
	M365_AUTH_ENV,
	M365_CLIENT_ID_ENV,
	M365_UPN_ENV,
	normalizeAuth,
	normalizeClientId,
	normalizeUpn,
	postForm,
	readAppSecret,
	requestAppToken,
	clearAppTokenCache,
	type M365Auth,
	type Post,
	type SecretReader,
} from "./m365app.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, tokensOnly, type CostItem, type M365Activity, type Provider, type ResetEvent, type SubPart } from "./types.js";

/**
 * Microsoft 365 Copilot license via Microsoft Graph. Two auth modes (key setting m365Auth):
 *  "az"  (default) token from the az CLI, calls on /me (no own app registration, no secret stored)
 *  "app" Entra app with client credentials (m365app.ts), calls on /users/{upn}; see appSubscription()
 * Calls in mode "az" (all GET, each degrades on its own; only the license call decides the status):
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

export interface M365Config {
	auth: M365Auth;
	tenant?: string;
	/** Raw tenant when a value exists but is invalid. */
	tenantRaw?: string;
	/** App mode only. */
	clientId?: string;
	clientIdRaw?: string;
	upn?: string;
	upnRaw?: string;
}

/** Auth mode, tenant, client ID and UPN: key settings (state.json) win over the env fallbacks. Pure validation, no secrets. */
export async function resolveM365Config(): Promise<M365Config> {
	const s = await loadState().catch(() => undefined);
	const t = await resolveTenant();
	const auth = normalizeAuth(s?.m365Auth || process.env[M365_AUTH_ENV]);
	const cfg: M365Config = { auth, ...(t.tenant ? { tenant: t.tenant } : {}), ...(t.raw ? { tenantRaw: t.raw } : {}) };
	if (auth !== "app") return cfg;
	const cid = (s?.m365ClientId || process.env[M365_CLIENT_ID_ENV] || "").trim();
	const upn = (s?.m365Upn || process.env[M365_UPN_ENV] || "").trim();
	const c = normalizeClientId(cid);
	if (c) cfg.clientId = c;
	else if (cid) cfg.clientIdRaw = cid;
	const u = normalizeUpn(upn);
	if (u) cfg.upn = u;
	else if (upn) cfg.upnRaw = upn;
	return cfg;
}

/** First missing/invalid setting of an app-mode config as status "config" text, or undefined when complete. */
export function appConfigProblem(c: M365Config): { detail: string; hint: string } | undefined {
	if (!c.tenant) return { detail: c.tenantRaw ? "tenantId ungültig (GUID oder Domain)" : `tenantId fehlt (Taste-Einstellung oder ${M365_TENANT_ENV})`, hint: "Tenant-ID" };
	if (!c.clientId) return { detail: c.clientIdRaw ? "clientId ungültig (GUID erwartet)" : `clientId fehlt (Taste-Einstellung oder ${M365_CLIENT_ID_ENV})`, hint: "Client-ID" };
	if (!c.upn) return { detail: c.upnRaw ? "UPN ungültig (name@domain erwartet)" : `UPN fehlt (Taste-Einstellung oder ${M365_UPN_ENV})`, hint: "UPN" };
	return undefined;
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
	auth: M365Auth = "az",
): SubPart {
	if (parts.license.kind !== "ok") {
		const h = httpStatus(parts.license);
		if (auth === "app" && parts.license.kind === "http") {
			const st = parts.license.status;
			if (st === 403) return { ...h, detail: `Graph 403: ${APP_CALLS.license.permission} fehlt (Admin-Consent)`, hint: "Recht fehlt", fetchedAt };
			if (st === 401) return { ...h, detail: "Graph 401: App-Token abgelehnt", hint: "Token abgelehnt", fetchedAt };
			if (st === 404) return { ...h, status: "config", detail: "UPN nicht gefunden (Graph 404)", hint: "UPN prüfen", fetchedAt };
		}
		return { ...h, detail: h.status === "login" && auth === "az" ? azLoginHint(tenant) : h.detail, fetchedAt };
	}
	const skus = copilotSkus(parts.license.json);
	const notes: string[] = [];
	let renewal: Renewal | undefined;
	const sr = parts.subscriptions;
	if (sr?.kind === "ok") renewal = copilotRenewal(sr.json, skus, now);
	else if (sr?.kind === "http" && (sr.status === 403 || sr.status === 401)) notes.push(auth === "app" ? `Verlängerung: ${APP_CALLS.subscriptions.permission} fehlt` : "Verlängerung: keine Berechtigung");
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

/** Test hook; also drops cached app tokens. */
export function clearM365Cache(): void {
	slowCache.clear();
	clearAppTokenCache();
	m365CallLog.clear();
}

/** Graph calls of the app mode with the application permission each needs (doctor names the missing one on 403). */
export const APP_CALLS = {
	license: { source: "GET graph /users/{upn}/licenseDetails", permission: "User.Read.All" },
	user: { source: "GET graph /users/{upn}", permission: "User.Read.All" },
	subscriptions: { source: "GET graph /directory/subscriptions", permission: "Organization.Read.All" },
	report: { source: "GET graph Copilot-Nutzungsbericht D30", permission: "Reports.Read.All" },
} as const;
export type AppCall = keyof typeof APP_CALLS;

/** Result of each app-mode Graph call of the last subscription() run in this process: "ok", HTTP status or "offline". */
export const m365CallLog = new Map<AppCall, "ok" | "offline" | number>();

/** Which app call a Graph URL belongs to (report nextLinks included). */
export function appCallOf(url: string): AppCall | undefined {
	if (/\/licenseDetails\b/.test(url)) return "license";
	if (url.includes("/directory/subscriptions")) return "subscriptions";
	if (/\/reports\//.test(url) || /getMicrosoft365CopilotUsage/i.test(url)) return "report";
	if (/\/v1\.0\/users\//.test(url)) return "user";
	return undefined;
}

/** /users/{upn}…: the UPN is validated (normalizeUpn) and URL-encoded. */
export function userUrl(upn: string, suffix = ""): string {
	return `${GRAPH}/v1.0/users/${encodeURIComponent(upn)}${suffix}`;
}

export interface AppDeps {
	readSecret?: SecretReader;
	post?: Post;
	get?: (url: string, headers: Record<string, string>) => Promise<HttpResult>;
	now?: number;
}

/**
 * Subscription in app mode: keychain secret → client-credentials token → /users/{upn}/licenseDetails, then
 * (cached 30 min) /directory/subscriptions, /users/{upn} for the row match and the usage report. Same parsing as "az".
 */
export async function appSubscription(cfg: M365Config, deps: AppDeps = {}): Promise<SubPart> {
	const fetchedAt = nowIso();
	const problem = appConfigProblem(cfg);
	if (problem) return { status: "config", ...problem, fetchedAt };
	const tenant = cfg.tenant!;
	const clientId = cfg.clientId!;
	const upn = cfg.upn!;
	const sec = await (deps.readSecret ?? readAppSecret)();
	if (sec.status === "missing") return { status: "key_missing", detail: `Keychain "${M365_APP_KEYCHAIN}" fehlt: ${keychainHint()}`, hint: "Secret fehlt", fetchedAt };
	if (sec.status === "error") return { status: "error", detail: `Keychain "${M365_APP_KEYCHAIN}": ${sec.detail}`, hint: "Keychain", fetchedAt };
	const tok = await requestAppToken(tenant, clientId, sec.value, deps.post ?? postForm, deps.now);
	if (tok.status !== "found") {
		const out: SubPart = { status: tok.status, detail: tok.detail, hint: tok.hint, fetchedAt };
		if (tok.status === "error" && tok.httpCode) {
			const h = httpStatus({ kind: "http", status: tok.httpCode, body: "", ...(tok.retryAfter ? { retryAfter: tok.retryAfter } : {}) });
			if (h.httpCode) out.httpCode = h.httpCode;
			if (h.retryAfterMs !== undefined) out.retryAfterMs = h.retryAfterMs;
		}
		return out;
	}
	m365CallLog.clear();
	const h = { Authorization: `Bearer ${tok.token}` };
	const rawGet = deps.get ?? ((url: string, headers: Record<string, string>) => getJson(url, headers, { timeoutMs: 20_000 }));
	const get: Get = async (url) => {
		const r = await rawGet(url, h);
		const call = appCallOf(url);
		if (call) m365CallLog.set(call, r.kind === "ok" ? "ok" : r.kind === "offline" ? "offline" : r.status);
		return r;
	};
	const license = await get(userUrl(upn, "/licenseDetails?$select=skuPartNumber,skuId"));
	if (license.kind !== "ok") return buildM365Sub({ license }, tenant, fetchedAt, Date.now(), "app");
	const key = `app|${tenant}|${clientId}|${upn}`;
	let slow = slowCache.get(key);
	if (!slow || Date.now() - slow.at > SLOW_TTL_MS) {
		const [subscriptions, user] = await Promise.all([
			get(`${GRAPH}/v1.0/directory/subscriptions?$select=skuPartNumber,nextLifecycleDateTime,totalLicenses,status`),
			get(userUrl(upn, "?$select=userPrincipalName,displayName")),
		]);
		const rowUpn = user.kind === "ok" ? pick(user.json, "userPrincipalName") : undefined;
		let activity: M365Activity;
		if (typeof rowUpn === "string" && rowUpn) {
			activity = await reportActivity(get, rowUpn);
			if (activity.status === "forbidden") activity = { ...activity, detail: `Nutzung: ${APP_CALLS.report.permission} fehlt` };
		} else {
			const why = user.kind === "ok" ? "UPN fehlt" : user.kind === "offline" ? "offline" : user.status === 403 ? `${APP_CALLS.user.permission} fehlt` : `/users HTTP ${user.status}`;
			activity = { status: "error", apps: [], detail: `Nutzung: ${why}` };
		}
		slow = { at: Date.now(), subscriptions, activity };
		if (subscriptions.kind !== "offline" && activity.status !== "error") slowCache.set(key, slow);
	}
	return buildM365Sub({ license, subscriptions: slow.subscriptions, activity: slow.activity }, tenant, fetchedAt, Date.now(), "app");
}

/** Required application permissions missing from a token's roles claim. */
export function missingPermissions(roles: string[]): string[] {
	return APP_PERMISSIONS.filter((p) => !roles.includes(p));
}

export const m365copilot: Provider = {
	id: "m365copilot",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const cfg = await resolveM365Config();
			if (cfg.auth === "app") return subOnly("m365copilot", await appSubscription(cfg));
			if (!cfg.tenant) {
				const detail = cfg.tenantRaw ? "tenantId ungültig (GUID oder Domain)" : `tenantId fehlt (Taste-Einstellung oder ${M365_TENANT_ENV})`;
				return subOnly("m365copilot", { status: "config", detail, fetchedAt });
			}
			const tenant = cfg.tenant;
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
