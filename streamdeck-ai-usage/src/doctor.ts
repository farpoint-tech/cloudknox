import fs from "node:fs/promises";
import { listFiles } from "./lines.js";
import { readSecret } from "./keychain.js";
import { CONFIG_DIR, COPILOT_DB, GEMINI_OAUTH, GEMINI_TMP, GROK_AUTH, SQLITE_BIN } from "./paths.js";
import { ANTHROPIC_ADMIN, CLAUDE_KEYCHAIN, readClaudeCred } from "./providers/claude.js";
import { OPENAI_ADMIN, readCodexCred } from "./providers/codex.js";
import { GITHUB_BILLING_PAT, readGhToken } from "./providers/copilot.js";
import {
	APP_CALLS,
	appConfigProblem,
	m365CallLog,
	M365_TENANT_ENV,
	missingPermissions,
	readAzGraphToken,
	resolveM365Config,
	resolveTenant,
	type AppCall,
	type M365Config,
} from "./providers/m365copilot.js";
import { M365_APP_KEYCHAIN, readAppSecret, requestAppToken, tokenRoles, type Post, type SecretReader } from "./providers/m365app.js";
import { grokCallLog, readGrokCred, XAI_MANAGEMENT, XAI_TEAM_ID, type GrokCall, type GrokCred } from "./providers/grok.js";
import { parseGeminiLine } from "./collectors/gemini-jsonl.js";
import type { ProviderId, SubPart } from "./providers/types.js";
import { gatedSub } from "./subgate.js";

export const RATE_LIMIT_NOTE = "rate-limited (andere Plugins pollen denselben Endpunkt)";

/**
 * Classifies a subscription result for the doctor table. 429 (fresh or a running 429 cooldown)
 * is a warning, not "invalid": other Stream Deck plugins poll the same endpoint.
 */
export function subCheck(provider: string, source: string, sub: SubPart): Check {
	if (sub.status === "ok") return { provider, source, result: "ok", note: sub.source === "cache" ? "aus Cache (< 55 s)" : undefined };
	if (sub.httpCode === 429) return { provider, source, result: "warn", note: `${RATE_LIMIT_NOTE}; ${sub.detail ?? ""}`.trim() };
	if (sub.status === "stale") return { provider, source, result: "warn", note: sub.detail };
	return { provider, source, result: "invalid", note: `${sub.status}: ${sub.detail ?? ""}` };
}

/** Doctor goes through the gate too: it must not hit an endpoint that is in cooldown. */
const probe = (id: ProviderId) => gatedSub(id, { force: true });

export interface Check {
	provider: string;
	source: string;
	result: "found" | "missing" | "invalid" | "ok" | "info" | "warn";
	note?: string;
	/** "optional": API-key costs (admin keys exist only for Enterprise/Teams accounts); listed separately as info. */
	group?: "optional";
}

async function exists(p: string): Promise<boolean> {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

export const OPTIONAL_NOTE = "optional (nur Enterprise/Teams)";

/**
 * API-key entry (admin keys for API costs). Without `probe` the keychain is not touched: personal subscriptions
 * have no admin keys, so the entry is listed as info. With `probe` (doctor --api): presence + prefix check,
 * a missing entry is still info, never "missing". Never returns the value.
 */
async function keyCheck(provider: string, service: string, probe: boolean, prefix?: string): Promise<Check> {
	const source = `Keychain "${service}"`;
	const base = { provider, source, group: "optional" as const };
	if (!probe) return { ...base, result: "info", note: "nicht geprüft (doctor --api prüft)" };
	const r = await readSecret(service);
	if (r.status === "missing") return { ...base, result: "info", note: `nicht angelegt – nur nötig mit showApiCost: bash tools/apikey_setzen.sh ${service}` };
	if (r.status === "error") return { ...base, result: "invalid", note: r.detail };
	if (prefix && !r.value.startsWith(prefix)) return { ...base, result: "invalid", note: `erwartet Präfix ${prefix}…` };
	return { ...base, result: "found" };
}

export async function doctor(opts: { api?: boolean } = {}): Promise<Check[]> {
	const out: Check[] = [];
	const api = !!opts.api;

	// Claude
	const cc = await readClaudeCred();
	if (cc.status === "found") {
		const left = cc.expiresAt ? Math.round((cc.expiresAt - Date.now()) / 60_000) : undefined;
		out.push({
			provider: "claude",
			source: `Keychain "${CLAUDE_KEYCHAIN}"`,
			result: left !== undefined && left < 0 ? "invalid" : "found",
			note: [cc.plan && `Plan ${cc.plan}`, left !== undefined && (left < 0 ? "abgelaufen – Claude Code öffnen" : `gültig noch ${left} min`)].filter(Boolean).join(", "),
		});
	} else out.push({ provider: "claude", source: `Keychain "${CLAUDE_KEYCHAIN}"`, result: cc.status, note: cc.detail });
	out.push(subCheck("claude", "GET api.anthropic.com/api/oauth/usage", await probe("claude")));
	out.push(await keyCheck("claude", ANTHROPIC_ADMIN, api, "sk-ant-admin"));

	// Codex
	const xc = await readCodexCred();
	out.push({ provider: "codex", source: "~/.codex/auth.json", result: xc.status, note: xc.status === "found" ? (xc.accountId ? "account_id vorhanden" : "account_id fehlt") : xc.detail });
	out.push(subCheck("codex", "GET chatgpt.com/backend-api/wham/usage", await probe("codex")));
	out.push(await keyCheck("codex", OPENAI_ADMIN, api, "sk-admin-"));

	// Copilot
	const gt = await readGhToken();
	out.push({ provider: "copilot", source: "gh auth token", result: gt.status, note: gt.status === "found" ? undefined : gt.detail });
	if (gt.status === "found") {
		out.push(subCheck("copilot", "GET api.github.com/copilot_internal/user", await probe("copilot")));
	}
	out.push({ provider: "copilot", source: "~/.copilot/data.db", result: (await exists(COPILOT_DB)) ? "found" : "missing" });
	out.push({ provider: "copilot", source: SQLITE_BIN, result: (await exists(SQLITE_BIN)) ? "found" : "missing" });
	out.push(await keyCheck("copilot", GITHUB_BILLING_PAT, api));

	// M365 Copilot, mode "app": Entra app with client credentials. Secret and token are never printed.
	const mcfg = await resolveM365Config();
	if (mcfg.auth === "app") out.push(...(await m365AppChecks(mcfg)));
	// M365 Copilot (Graph via az CLI). Token is checked for presence only, never printed.
	const mt = await resolveTenant();
	if (mcfg.auth === "app") {
		/* app-mode rows already added; the az checks below do not apply */
	} else if (!mt.tenant) {
		out.push({ provider: "m365copilot", source: `tenantId (Taste / ${M365_TENANT_ENV})`, result: mt.raw ? "invalid" : "missing", note: mt.raw ? "GUID oder Domain erwartet" : `Taste-Einstellung oder ${M365_TENANT_ENV}=<tenant>` });
	} else {
		out.push({ provider: "m365copilot", source: "tenantId", result: "found", note: mt.tenant });
		const az = await readAzGraphToken(mt.tenant);
		out.push({ provider: "m365copilot", source: "az account get-access-token (ms-graph)", result: az.status === "found" ? "found" : az.status === "missing" ? "missing" : "invalid", note: az.status === "found" ? "Token vorhanden" : az.detail });
		if (az.status === "found") {
			const sub = await probe("m365copilot");
			out.push(subCheck("m365copilot", "GET graph /me/licenseDetails", sub));
			if (sub.primary) {
				const a = sub.activity;
				const renewal = sub.resets?.[0]?.resetsAt;
				out.push({ provider: "m365copilot", source: "GET graph /directory/subscriptions", result: renewal ? "ok" : "info", note: renewal ? `Verlängerung ${renewal.slice(0, 10)}` : (sub.detail?.match(/Verlängerung: [^;]+/)?.[0] ?? "keine Copilot-Subscription gefunden") });
				out.push({
					provider: "m365copilot",
					source: "GET graph Copilot-Nutzungsbericht D30",
					result: a?.status === "ok" ? "ok" : a?.status === "forbidden" ? "info" : "warn",
					note: a?.status === "ok" ? `aktiv in: ${a.apps.join(", ") || "–"}` : a?.status === "forbidden" ? "Reports.Read.All / Reports Reader fehlt (optional)" : (a?.detail ?? "kein Ergebnis"),
				});
			}
		}
	}

	// Gemini
	out.push({ provider: "gemini", source: "~/.gemini/oauth_creds.json", result: (await exists(GEMINI_OAUTH)) ? "found" : "missing", note: "Abo-Quota in v1 n/v" });
	const chats = await listFiles(GEMINI_TMP, (n) => n.startsWith("session-") && n.endsWith(".jsonl"));
	let withUsage = 0;
	for (const f of chats.slice(-20)) {
		const text = await fs.readFile(f, "utf8").catch(() => "");
		if (text.split("\n").some((l) => parseGeminiLine(l))) withUsage++;
	}
	out.push({ provider: "gemini", source: "~/.gemini/tmp/*/chats/session-*.jsonl", result: "info", note: `${chats.length} Dateien, ${withUsage} mit tokens-Feldern (letzte 20 geprüft)` });

	// Grok
	out.push(...(await grokChecks()));
	out.push(await keyCheck("grok", XAI_MANAGEMENT, api));
	out.push(await keyCheck("grok", XAI_TEAM_ID, api));

	// Local config dir
	let writable = true;
	try {
		await fs.mkdir(CONFIG_DIR, { recursive: true });
		await fs.access(CONFIG_DIR, fs.constants.W_OK);
	} catch {
		writable = false;
	}
	out.push({ provider: "-", source: CONFIG_DIR, result: writable ? "ok" : "invalid", note: writable ? "beschreibbar" : "nicht beschreibbar" });
	return out;
}

/**
 * Doctor rows for M365 app mode: settings, keychain entry (found/missing), token endpoint (ok / AADSTS code, granted
 * application permissions from the token's roles claim), then each Graph call of one gated fetch (ok / 403 with the
 * missing permission). `deps` replace keychain, token POST and the gated fetch in tests.
 */
export async function m365AppChecks(
	cfg: M365Config,
	deps: { readSecret?: SecretReader; post?: Post; fetchSub?: () => Promise<SubPart> } = {},
): Promise<Check[]> {
	const P = "m365copilot";
	const out: Check[] = [{ provider: P, source: "m365Auth", result: "info", note: "app (Entra-App, Client Credentials)" }];
	const problem = appConfigProblem(cfg);
	out.push({ provider: P, source: "tenantId / clientId / upn", result: problem ? (/ungültig/.test(problem.detail) ? "invalid" : "missing") : "found", note: problem ? problem.detail : `${cfg.tenant} · ${cfg.clientId} · ${cfg.upn}` });
	if (problem) return out;
	const sec = await (deps.readSecret ?? readAppSecret)();
	const ksrc = `Keychain "${M365_APP_KEYCHAIN}"`;
	if (sec.status !== "found") {
		out.push({ provider: P, source: ksrc, result: sec.status === "missing" ? "missing" : "invalid", note: sec.status === "missing" ? "bash tools/m365-register-app.sh oder security add-generic-password -s m365-copilot-app -a \"$USER\" -U -w" : sec.detail });
		return out;
	}
	out.push({ provider: P, source: ksrc, result: "found", note: sec.source === "env" ? "aus Umgebungsvariable (nur Tests)" : undefined });
	const tok = await requestAppToken(cfg.tenant!, cfg.clientId!, sec.value, deps.post);
	const tsrc = "POST login.microsoftonline.com/…/oauth2/v2.0/token";
	if (tok.status !== "found") {
		out.push({ provider: P, source: tsrc, result: tok.status === "offline" ? "warn" : "invalid", note: tok.detail });
		return out;
	}
	const missing = missingPermissions(tokenRoles(tok.token));
	out.push({ provider: P, source: tsrc, result: missing.length ? "warn" : "ok", note: missing.length ? `Token ok, im Token fehlt: ${missing.join(", ")} (Admin-Consent)` : "Token ok, Rechte vollständig" });
	const sub = await (deps.fetchSub ?? (() => probe("m365copilot")))();
	if (sub.source === "cache" || sub.cooldownUntil) {
		out.push({ provider: P, source: "Graph", result: "info", note: sub.cooldownUntil ? `Cooldown bis ${sub.cooldownUntil}` : "aus Cache (< 55 s), Graph nicht abgerufen" });
		return out;
	}
	for (const call of Object.keys(APP_CALLS) as AppCall[]) {
		const { source, permission } = APP_CALLS[call];
		const r = m365CallLog.get(call);
		if (r === undefined) out.push({ provider: P, source, result: "info", note: "nicht abgerufen" });
		else if (r === "ok") out.push({ provider: P, source, result: "ok" });
		else if (r === 403 || r === 401) out.push({ provider: P, source, result: "invalid", note: `HTTP ${r}: ${permission} fehlt (Application, Admin-Consent)` });
		else if (r === 404 && call !== "report") out.push({ provider: P, source, result: "invalid", note: "HTTP 404: UPN nicht gefunden" });
		else out.push({ provider: P, source, result: "warn", note: r === "offline" ? "offline" : `HTTP ${r}` });
	}
	if (sub.status === "ok" && sub.activity?.status === "ok") out.push({ provider: P, source: "Nutzung", result: "info", note: `aktiv in: ${sub.activity.apps.join(", ") || "–"}` });
	else if (sub.activity?.detail) out.push({ provider: P, source: "Nutzung", result: "info", note: sub.activity.detail });
	return out;
}

const GROK_CALLS: Record<GrokCall, string> = {
	billing: "GET cli-chat-proxy.grok.com/v1/billing",
	user: "GET cli-chat-proxy.grok.com/v1/user",
	subscriptions: "GET grok.com/rest/subscriptions",
};

/** auth.json row: mode and expiry only (no e-mail, no token). */
export function grokAuthCheck(c: GrokCred, now = Date.now()): Check {
	const source = "~/.grok/auth.json";
	if (c.status !== "found") return { provider: "grok", source, result: c.status, note: c.detail };
	const mode = c.authMode ?? (c.entryId === undefined ? "flach" : "?");
	const field = c.tokenField === "key" ? "" : `, Feld ${c.tokenField}`;
	if (c.expiresAt === undefined) return { provider: "grok", source, result: "found", note: `Modus ${mode}${field}, ohne Ablauf` };
	const left = Math.round((c.expiresAt - now) / 60_000);
	const when = new Date(c.expiresAt).toISOString().slice(0, 16).replace("T", " ") + " UTC";
	const exp = left < 0 ? `abgelaufen seit ${when}${c.refreshToken ? ", Refresh beim nächsten Abruf" : " – grok login"}` : `gültig bis ${when} (noch ${left} min)`;
	return { provider: "grok", source, result: left < 0 && !c.refreshToken ? "invalid" : "found", note: `Modus ${mode}${field}, ${exp}` };
}

/** Doctor rows for Grok: auth.json, then each endpoint of one gated fetch (ok / HTTP code). */
export async function grokChecks(deps: { file?: string; fetchSub?: () => Promise<SubPart> } = {}): Promise<Check[]> {
	const c = await readGrokCred(deps.file ?? GROK_AUTH);
	const out: Check[] = [grokAuthCheck(c)];
	if (c.status !== "found") return out;
	const sub = await (deps.fetchSub ?? (() => probe("grok")))();
	if (sub.source === "cache" || sub.cooldownUntil) {
		out.push(subCheck("grok", GROK_CALLS.billing, sub));
		out.push({ provider: "grok", source: "user / subscriptions", result: "info", note: sub.cooldownUntil ? `Cooldown bis ${sub.cooldownUntil}` : "aus Cache (< 55 s), nicht abgerufen" });
		return out;
	}
	if (sub.status === "login" && !grokCallLog.size) {
		out.push({ provider: "grok", source: GROK_CALLS.billing, result: "invalid", note: sub.detail });
		return out;
	}
	for (const call of Object.keys(GROK_CALLS) as GrokCall[]) {
		const r = grokCallLog.get(call);
		const source = GROK_CALLS[call];
		if (r === undefined) out.push({ provider: "grok", source, result: "info", note: "nicht abgerufen" });
		else if (r === "ok" && call === "billing" && sub.status !== "ok") out.push({ provider: "grok", source, result: "invalid", note: `HTTP 200, ${sub.status}: ${sub.detail ?? ""}`.trim() });
		else if (r === "ok") out.push({ provider: "grok", source, result: "ok", note: call === "billing" ? [sub.primary && `${sub.primary.label} ${sub.primary.text ?? Math.round(sub.primary.pct) + "%"}`, sub.detail].filter(Boolean).join(" · ") || undefined : call === "subscriptions" ? `Tarif: ${sub.plan ?? "?"}` : undefined });
		else if (r === "offline") out.push({ provider: "grok", source, result: "warn", note: "offline" });
		else if (r === 429) out.push({ provider: "grok", source, result: "warn", note: `HTTP 429, ${RATE_LIMIT_NOTE}` });
		else out.push({ provider: "grok", source, result: call === "billing" ? "invalid" : "warn", note: `HTTP ${r}${call === "billing" ? "" : " (optional, nur Tarif)"}` });
	}
	return out;
}
