import { getJson, num, pick, type HttpResult } from "../http.js";
import { readSecret, type SecretResult } from "../keychain.js";

/**
 * Microsoft 365 Copilot, auth mode "app": Entra app registration (enterprise app) with client credentials.
 * No az CLI, no interactive login. The secret comes from the macOS keychain (service m365-copilot-app,
 * account = current user); AI_USAGE_DECK_M365_CLIENT_SECRET exists for tests only.
 * TODO: certificate credential (client_assertion, private key in the keychain) as alternative to the secret – not implemented.
 */

export type M365Auth = "az" | "app";

export const M365_APP_KEYCHAIN = "m365-copilot-app";
/** Tests only: secret when the keychain has no entry. Never document this for real use. */
export const M365_SECRET_ENV = "AI_USAGE_DECK_M365_CLIENT_SECRET";
export const M365_AUTH_ENV = "AI_USAGE_DECK_M365_AUTH";
export const M365_CLIENT_ID_ENV = "AI_USAGE_DECK_M365_CLIENT_ID";
export const M365_UPN_ENV = "AI_USAGE_DECK_M365_UPN";

export const LOGIN_HOST = "https://login.microsoftonline.com";
export const GRAPH_DEFAULT_SCOPE = "https://graph.microsoft.com/.default";
/** Token is reused until expires_in minus this margin. */
export const TOKEN_MARGIN_MS = 5 * 60_000;

/** Microsoft Graph application permissions the app needs (names as in the Entra portal). */
export const APP_PERMISSIONS = ["Reports.Read.All", "Organization.Read.All", "User.Read.All"] as const;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMAIN = /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
/** Local part starts with a letter, digit or underscore (never "-"); no quotes, slashes, '#', '$' or spaces. */
const UPN_LOCAL = /^[a-z0-9_][a-z0-9._+-]{0,63}$/i;

export function normalizeAuth(v: unknown): M365Auth {
	return typeof v === "string" && v.trim().toLowerCase() === "app" ? "app" : "az";
}

/** Application (client) ID: GUID only, lowercased. */
export function normalizeClientId(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const t = v.trim();
	return GUID.test(t) ? t.toLowerCase() : undefined;
}

/** User principal name "name@domain", lowercased; anything else (incl. flag-like or path-like values) → undefined. */
export function normalizeUpn(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const t = v.trim();
	const at = t.lastIndexOf("@");
	if (at <= 0 || t.indexOf("@") !== at) return undefined;
	const local = t.slice(0, at);
	const domain = t.slice(at + 1);
	return UPN_LOCAL.test(local) && DOMAIN.test(domain) ? t.toLowerCase() : undefined;
}

/** POST body and URL of the client-credentials request (pure; tested). The secret only lives in the body. */
export function tokenRequest(tenant: string, clientId: string, secret: string): { url: string; body: string; headers: Record<string, string> } {
	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: secret,
		scope: GRAPH_DEFAULT_SCOPE,
		grant_type: "client_credentials",
	}).toString();
	return {
		url: `${LOGIN_HOST}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
		body,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	};
}

/** Short German key text per AADSTS code; unknown codes get "Anmeldung". */
export const AADSTS_HINTS: Record<string, string> = {
	AADSTS7000215: "Secret falsch",
	AADSTS7000222: "Secret abgelaufen",
	AADSTS700016: "App fehlt",
	AADSTS65001: "Consent fehlt",
	AADSTS500011: "Consent fehlt",
};

export function aadstsCode(text: string | undefined): string | undefined {
	return text?.match(/AADSTS\d+/)?.[0];
}

/** "Secret falsch (AADSTS7000215)"; `hint` is the short key text. */
export function mapAadsts(code: string | undefined): { hint: string; detail: string } {
	const hint = (code && AADSTS_HINTS[code]) || "Anmeldung";
	return { hint, detail: code ? `${hint} (${code})` : hint };
}

export type AppToken =
	| { status: "found"; token: string; expiresAt: number; cached: boolean }
	| { status: "login" | "error" | "offline"; detail: string; hint: string; code?: string; httpCode?: number; retryAfter?: string };

export type Post = (url: string, body: string, headers: Record<string, string>) => Promise<HttpResult>;
export const postForm: Post = (url, body, headers) => getJson(url, headers, { method: "POST", body, timeoutMs: 20_000 });

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function clearAppTokenCache(): void {
	tokenCache.clear();
}

/**
 * Client-credentials token for Graph, cached in memory until expires_in minus 5 min.
 * Error results carry only the AADSTS code and a short text, never the response body or the secret.
 */
export async function requestAppToken(tenant: string, clientId: string, secret: string, post: Post = postForm, now = Date.now()): Promise<AppToken> {
	const key = `${tenant}|${clientId}`;
	const hit = tokenCache.get(key);
	if (hit && hit.expiresAt - TOKEN_MARGIN_MS > now) return { status: "found", token: hit.token, expiresAt: hit.expiresAt, cached: true };
	const req = tokenRequest(tenant, clientId, secret);
	const r = await post(req.url, req.body, req.headers);
	if (r.kind === "offline") return { status: "offline", detail: "Token-Endpunkt: offline", hint: "offline" };
	if (r.kind === "http") {
		const code = aadstsCode(r.body);
		const m = mapAadsts(code);
		if (code || r.status === 400 || r.status === 401) return { status: "login", detail: m.detail, hint: m.hint, ...(code ? { code } : {}), httpCode: r.status };
		return { status: "error", detail: `Token-Endpunkt: HTTP ${r.status}`, hint: `HTTP ${r.status}`, httpCode: r.status, ...(r.retryAfter ? { retryAfter: r.retryAfter } : {}) };
	}
	const token = pick(r.json, "access_token");
	const expiresIn = num(pick(r.json, "expires_in"));
	if (typeof token !== "string" || !/^ey[\w-]+\.[\w-]+\.[\w-]*$/.test(token)) return { status: "error", detail: "Token-Endpunkt: unerwartete Antwort", hint: "Fehler" };
	const expiresAt = now + (expiresIn ?? 3600) * 1000;
	if (expiresAt - TOKEN_MARGIN_MS > now) tokenCache.set(key, { token, expiresAt });
	return { status: "found", token, expiresAt, cached: false };
}

/** `roles` claim of an app token (application permissions granted with admin consent). No signature check: display only. */
export function tokenRoles(token: string): string[] {
	const payload = token.split(".")[1];
	if (!payload) return [];
	try {
		const roles = pick(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), "roles");
		return Array.isArray(roles) ? roles.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

export type SecretSource = SecretResult & { source?: "keychain" | "env" };
export type SecretReader = () => Promise<SecretSource>;

/** Keychain first; the env variable only when the keychain has no entry (tests). The value is never logged. */
export const readAppSecret: SecretReader = async () => {
	const k = await readSecret(M365_APP_KEYCHAIN);
	if (k.status === "found") return { ...k, source: "keychain" };
	const env = process.env[M365_SECRET_ENV];
	if (env) return { status: "found", value: env, source: "env" };
	return k;
};

export function keychainHint(): string {
	return `security add-generic-password -s ${M365_APP_KEYCHAIN} -a "$USER" -U -w (fragt verdeckt) oder tools/m365-register-app.sh`;
}
