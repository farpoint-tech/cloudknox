import fs from "node:fs/promises";
import path from "node:path";
import { getJson, num, pick, type HttpResult } from "../http.js";
import { readSecret } from "../keychain.js";
import { GROK_AUTH } from "../paths.js";
import { isoOrUndefined, resetWindowName } from "../resets.js";
import { httpStatus } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, tokensOnly, type CostItem, type Provider, type ResetEvent, type Window } from "./types.js";

export const XAI_MANAGEMENT = "xai-management";
export const XAI_TEAM_ID = "xai-team-id";

export const GROK_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
export const GROK_USER_URL = "https://cli-chat-proxy.grok.com/v1/user?include=subscription";
export const GROK_SUBS_URL = "https://grok.com/rest/subscriptions";

/**
 * Money fields of /v1/billing (`onDemandCap`, `onDemandUsed`, `prepaidBalance`) arrive as `{val}`. Observed values are all 0,
 * so the unit is UNVERIFIED; assumed cents like the xAI Management API (`amountBeforeVat`, `total.val`).
 */
export const GROK_BILLING_CENTS = 100;

/** Token fields accepted per auth.json entry: grok CLI 1.0.70 writes `key`; older/community builds `access_token`/`accessToken`. */
const TOKEN_FIELDS = ["key", "access_token", "accessToken"] as const;
type TokenField = (typeof TOKEN_FIELDS)[number];

export type GrokCred =
	| {
			status: "found";
			token: string;
			/** Epoch ms; undefined when the entry has no expiry. */
			expiresAt?: number;
			/** Key of the entry in the auth.json object ("<issuer>::<client-id>"); undefined for a flat legacy file. */
			entryId?: string;
			tokenField: TokenField;
			authMode?: string;
			refreshToken?: string;
			issuer?: string;
			clientId?: string;
	  }
	| { status: "missing" | "invalid"; detail: string };

/** Expiry as epoch ms from ISO, epoch seconds or epoch ms (number or numeric string). */
export function parseExpiry(v: unknown): number | undefined {
	const n = num(v);
	if (n !== undefined) return n < 1e12 ? n * 1000 : n;
	if (typeof v === "string" && v) {
		const t = Date.parse(v);
		if (Number.isFinite(t)) return t;
	}
	return undefined;
}

function tokenFieldOf(e: unknown): TokenField | undefined {
	if (!e || typeof e !== "object") return undefined;
	return TOKEN_FIELDS.find((f) => {
		const v = (e as Record<string, unknown>)[f];
		return typeof v === "string" && v.length > 0;
	});
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/**
 * Parses ~/.grok/auth.json. grok CLI 1.0.70: an object keyed by "<issuer>::<client-id>", each entry with `key` (access token),
 * `expires_at` (ISO), `refresh_token`, `oidc_issuer`, `oidc_client_id`, `auth_mode`. A flat object with the token at the top
 * level (older builds) is accepted too. With several entries the one with the latest expiry wins.
 */
export function parseGrokAuth(raw: string): GrokCred {
	let o: any;
	try {
		o = JSON.parse(raw);
	} catch {
		return { status: "invalid", detail: "kein JSON" };
	}
	if (!o || typeof o !== "object" || Array.isArray(o)) return { status: "invalid", detail: "kein Objekt" };
	const candidates: { id?: string; e: Record<string, unknown>; field: TokenField }[] = [];
	const flat = tokenFieldOf(o);
	if (flat) candidates.push({ e: o, field: flat });
	else {
		for (const [id, e] of Object.entries(o)) {
			const field = tokenFieldOf(e);
			if (field) candidates.push({ id, e: e as Record<string, unknown>, field });
		}
	}
	if (!candidates.length) return { status: "invalid", detail: "kein Token (key/access_token)" };
	const exp = (c: (typeof candidates)[number]) => parseExpiry(c.e.expires_at ?? c.e.expiresAt ?? c.e.expiry);
	candidates.sort((a, b) => (exp(b) ?? -Infinity) - (exp(a) ?? -Infinity));
	const best = candidates[0];
	return {
		status: "found",
		token: best.e[best.field] as string,
		expiresAt: exp(best),
		entryId: best.id,
		tokenField: best.field,
		authMode: str(best.e.auth_mode),
		refreshToken: str(best.e.refresh_token ?? best.e.refreshToken),
		issuer: str(best.e.oidc_issuer),
		clientId: str(best.e.oidc_client_id),
	};
}

export async function readGrokCred(file = GROK_AUTH): Promise<GrokCred> {
	let raw: string;
	try {
		raw = await fs.readFile(file, "utf8");
	} catch {
		return { status: "missing", detail: "~/.grok/auth.json fehlt (grok login)" };
	}
	return parseGrokAuth(raw);
}

/** Token is treated as expired this long before `expires_at`. */
export const REFRESH_SKEW_MS = 60_000;

export type FormPost = (url: string, form: Record<string, string>) => Promise<HttpResult>;

const defaultPost: FormPost = (url, form) =>
	getJson(url, { "Content-Type": "application/x-www-form-urlencoded" }, { method: "POST", body: new URLSearchParams(form).toString() });

/**
 * Writes the refreshed token into the same entry of auth.json: re-reads the file right before writing (the grok CLI refreshes
 * the same file too), changes only the token field, `expires_at` and `refresh_token`, keeps every other field and entry,
 * then writes temp file + rename with mode 0600.
 */
export async function writeBackGrokToken(
	file: string,
	cred: Extract<GrokCred, { status: "found" }>,
	upd: { token: string; expiresAt?: number; refreshToken?: string },
): Promise<void> {
	const o = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, any>;
	const entry: Record<string, any> | undefined = cred.entryId === undefined ? o : o[cred.entryId];
	if (!entry || typeof entry !== "object") throw new Error("Eintrag in auth.json verschwunden");
	entry[cred.tokenField] = upd.token;
	if (upd.expiresAt !== undefined) {
		const key = "expires_at" in entry ? "expires_at" : "expiresAt" in entry ? "expiresAt" : "expires_at";
		const old = entry[key];
		// Keep the stored format: epoch seconds / ms stay numbers, everything else becomes ISO.
		entry[key] = typeof old === "number" ? (old < 1e12 ? Math.floor(upd.expiresAt / 1000) : upd.expiresAt) : new Date(upd.expiresAt).toISOString();
	}
	if (upd.refreshToken) entry["refreshToken" in entry && !("refresh_token" in entry) ? "refreshToken" : "refresh_token"] = upd.refreshToken;
	const tmp = path.join(path.dirname(file), `.auth.json.${process.pid}.${Date.now()}.tmp`);
	try {
		await fs.writeFile(tmp, JSON.stringify(o, null, 2) + "\n", { mode: 0o600 });
		await fs.chmod(tmp, 0o600);
		await fs.rename(tmp, file);
	} catch (e) {
		await fs.rm(tmp, { force: true });
		throw e;
	}
}

export type RefreshResult = { status: "ok"; cred: Extract<GrokCred, { status: "found" }> } | { status: "failed"; detail: string };

/**
 * OIDC refresh: POST `${oidc_issuer}/oauth2/token` with grant_type=refresh_token, client_id, refresh_token. auth.json is only
 * written when the endpoint returned a new access token. Never logs tokens.
 */
export async function refreshGrokToken(
	cred: Extract<GrokCred, { status: "found" }>,
	opts: { file?: string; post?: FormPost; now?: number } = {},
): Promise<RefreshResult> {
	if (!cred.refreshToken || !cred.issuer || !cred.clientId) return { status: "failed", detail: "kein refresh_token/oidc_issuer/oidc_client_id" };
	const now = opts.now ?? Date.now();
	const r = await (opts.post ?? defaultPost)(`${cred.issuer.replace(/\/+$/, "")}/oauth2/token`, {
		grant_type: "refresh_token",
		client_id: cred.clientId,
		refresh_token: cred.refreshToken,
	});
	if (r.kind !== "ok") return { status: "failed", detail: r.kind === "offline" ? `offline: ${r.detail}` : `Refresh HTTP ${r.status}` };
	const token = str(pick(r.json, "access_token"));
	if (!token) return { status: "failed", detail: "Refresh ohne access_token" };
	const expIn = num(pick(r.json, "expires_in"));
	const expiresAt = expIn !== undefined ? now + expIn * 1000 : parseExpiry(pick(r.json, "expires_at"));
	const refreshToken = str(pick(r.json, "refresh_token"));
	await writeBackGrokToken(opts.file ?? GROK_AUTH, cred, { token, expiresAt, refreshToken });
	return { status: "ok", cred: { ...cred, token, expiresAt, refreshToken: refreshToken ?? cred.refreshToken } };
}

/** Valid credential: reads auth.json and refreshes when the token is (about to be) expired. */
export async function usableGrokCred(
	opts: { file?: string; post?: FormPost; now?: number } = {},
): Promise<Extract<GrokCred, { status: "found" }> | { status: "login"; detail: string }> {
	const cred = await readGrokCred(opts.file);
	if (cred.status !== "found") return { status: "login", detail: cred.detail };
	const now = opts.now ?? Date.now();
	if (cred.expiresAt === undefined || cred.expiresAt - REFRESH_SKEW_MS > now) return cred;
	const r = await refreshGrokToken(cred, opts).catch((e) => ({ status: "failed" as const, detail: e instanceof Error ? e.message : String(e) }));
	if (r.status === "ok") return r.cred;
	return { status: "login", detail: `Token abgelaufen, ${r.detail} (grok login)` };
}

/** Cent amounts may arrive as number, string or {val}. */
export function centsOf(v: unknown): number | undefined {
	return num(v) ?? num(pick(v, "val"));
}

const dollars = (v: unknown): number | undefined => {
	const c = centsOf(v);
	return c === undefined ? undefined : c / GROK_BILLING_CENTS;
};

/** Window name of `currentPeriod`: from its type (USAGE_PERIOD_TYPE_WEEKLY …), else from start/end. */
export function grokPeriodName(period: unknown): string {
	const type = String(pick(period, "type") ?? "");
	if (/WEEK/.test(type)) return "Woche";
	if (/MONTH/.test(type)) return "Monat";
	if (/DAY|DAILY/.test(type)) return "24h";
	const s = Date.parse(String(pick(period, "start") ?? pick(period, "startTime") ?? ""));
	const e = Date.parse(String(pick(period, "end") ?? pick(period, "endTime") ?? ""));
	return Number.isFinite(s) && Number.isFinite(e) && e > s ? resetWindowName((e - s) / 1000) : "Monat";
}

const SHORT: Record<string, string> = { Woche: "Wo", Monat: "Mo" };

export interface GrokBilling {
	primary: Window;
	resets: ResetEvent[];
	cost: CostItem[];
	/** CLI/detail text, e.g. "Woche · kein Limit sichtbar". */
	detail?: string;
}

/**
 * Maps GET /v1/billing?format=credits. Live 2026-10-25 (no subscription): `config.currentPeriod` {type WEEKLY, start, end},
 * `onDemandCap.val` 0, `onDemandUsed.val` 0, `prepaidBalance.val` 0, no `creditUsagePercent`. Percent: creditUsagePercent when
 * present, else onDemandUsed/onDemandCap when cap > 0, else none ("kein Limit sichtbar").
 */
export function mapGrokBilling(json: unknown): GrokBilling | undefined {
	const c = pick(json, "config") ?? json;
	const period = pick(c, "currentPeriod");
	const end = isoOrUndefined(pick(period, "end") ?? pick(period, "endTime") ?? pick(c, "billingPeriodEnd"));
	const window = grokPeriodName(period);
	const label = SHORT[window] ?? window;
	const cap = dollars(pick(c, "onDemandCap"));
	const used = dollars(pick(c, "onDemandUsed"));
	const prepaid = dollars(pick(c, "prepaidBalance"));
	const credit = num(pick(c, "creditUsagePercent")) ?? num(pick(json, "creditUsagePercent"));
	if (!period && credit === undefined && cap === undefined) return undefined;

	let pct: number | undefined = credit;
	if (pct === undefined && cap !== undefined && cap > 0) pct = ((used ?? 0) / cap) * 100;

	const cost: CostItem[] = [];
	if (cap !== undefined && cap > 0) {
		cost.push({ label: "On-Demand", used: used ?? 0, limit: cap, currency: "USD", pct: ((used ?? 0) / cap) * 100, reached: (used ?? 0) >= cap, resetAt: end });
	}
	if (prepaid !== undefined && prepaid > 0) cost.push({ label: "Guthaben", used: prepaid, currency: "USD" });
	if (!cost.length) cost.push({ label: "On-Demand", used: used ?? 0, currency: "USD", note: cap === 0 ? "Cap 0" : undefined });

	const primary: Window = pct === undefined ? { label, pct: 0, text: "o. Limit", resetAt: end } : { label, pct, resetAt: end };
	return {
		primary,
		resets: end ? [{ provider: "grok", window, resetsAt: end, ...(pct === undefined ? {} : { pct }) }] : [],
		cost,
		detail: pct === undefined ? `${window} · kein Limit sichtbar` : undefined,
	};
}

/** Tier from /v1/user?include=subscription (`subscriptionTier`) or grok.com/rest/subscriptions (`subscriptions[0]`). */
export function grokTier(user: unknown, subs: unknown): string | undefined {
	const t = pick(user, "subscriptionTier") ?? pick(user, "subscription", "tier");
	if (typeof t === "string" && t) return t;
	const first = pick(subs, "subscriptions", 0);
	if (typeof first === "string" && first) return first;
	for (const k of ["name", "tier", "plan", "productName", "subscriptionTier"]) {
		const v = pick(first, k);
		if (typeof v === "string" && v) return v;
	}
	return undefined;
}

/** HTTP result per Grok call of the last subscription fetch in this process, for the doctor rows. */
export type GrokCall = "billing" | "user" | "subscriptions";
export const grokCallLog = new Map<GrokCall, "ok" | number | "offline">();
const logCall = (call: GrokCall, r: HttpResult) => grokCallLog.set(call, r.kind === "ok" ? "ok" : r.kind === "offline" ? "offline" : r.status);

export const grok: Provider = {
	id: "grok",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			grokCallLog.clear();
			const cred = await usableGrokCred();
			if (cred.status !== "found") return subOnly("grok", { status: "login", detail: cred.detail, hint: "grok login", fetchedAt });
			const auth = { Authorization: `Bearer ${cred.token}` };
			const r = await getJson(GROK_BILLING_URL, auth);
			logCall("billing", r);
			if (r.kind !== "ok") return subOnly("grok", { ...httpStatus(r), fetchedAt });
			const m = mapGrokBilling(r.json);
			if (!m) return subOnly("grok", { status: "error", detail: "currentPeriod fehlt", fetchedAt });
			// Tier: both calls are optional; a failure there never hides the billing value.
			const [u, s] = await Promise.all([getJson(GROK_USER_URL, auth), getJson(GROK_SUBS_URL, auth)]);
			logCall("user", u);
			logCall("subscriptions", s);
			const tier = grokTier(u.kind === "ok" ? u.json : undefined, s.kind === "ok" ? s.json : undefined);
			const tierKnown = u.kind === "ok" || s.kind === "ok";
			return subOnly("grok", {
				status: "ok",
				primary: m.primary,
				plan: tier ?? (tierKnown ? "kein Abo" : undefined),
				resets: m.resets,
				cost: m.cost,
				detail: [m.detail, tier ? undefined : tierKnown ? "kein Abo" : "Abo unbekannt"].filter(Boolean).join(" · ") || undefined,
				fetchedAt,
			});
		}, (detail) => subOnly("grok", { status: "error", detail, fetchedAt: nowIso() })),

	localTokens: async (sinceIso) =>
		tokensOnly("grok", { status: "na", since: sinceIso, in: 0, out: 0, cached: 0, detail: "keine lokalen Logs", fetchedAt: nowIso() }),

	apiCost: (monthStartIso) =>
		guard(async () => {
			const month = monthLabel(monthStartIso);
			const fetchedAt = nowIso();
			const [key, team] = await Promise.all([readSecret(XAI_MANAGEMENT), readSecret(XAI_TEAM_ID)]);
			if (key.status === "missing" || team.status === "missing") return apiOnly("grok", { status: "key_missing", month, fetchedAt });
			if (key.status === "error" || team.status === "error") return apiOnly("grok", { status: "error", month, detail: "keychain", fetchedAt });
			const r = await getJson(
				`https://management-api.x.ai/v1/billing/teams/${encodeURIComponent(team.value)}/postpaid/invoice/preview`,
				{ Authorization: `Bearer ${key.value}` },
			);
			if (r.kind !== "ok") return apiOnly("grok", { ...httpStatus(r), month, fetchedAt });
			const cents = centsOf(pick(r.json, "coreInvoice", "amountBeforeVat"));
			if (cents === undefined) return apiOnly("grok", { status: "error", month, detail: "amountBeforeVat fehlt", fetchedAt });
			return apiOnly("grok", { status: "ok", usd: cents / 100, month, fetchedAt });
		}, (detail) => apiOnly("grok", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() })),
};
