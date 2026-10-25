import fs from "node:fs/promises";
import { listFiles } from "./lines.js";
import { readSecret } from "./keychain.js";
import { CONFIG_DIR, COPILOT_DB, GEMINI_OAUTH, GEMINI_TMP, SQLITE_BIN } from "./paths.js";
import { ANTHROPIC_ADMIN, CLAUDE_KEYCHAIN, readClaudeCred } from "./providers/claude.js";
import { OPENAI_ADMIN, readCodexCred } from "./providers/codex.js";
import { GITHUB_BILLING_PAT, readGhToken } from "./providers/copilot.js";
import { readGrokCred, XAI_MANAGEMENT, XAI_TEAM_ID } from "./providers/grok.js";
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
	const gk = await readGrokCred();
	out.push({ provider: "grok", source: "~/.grok/auth.json", result: gk.status, note: gk.status === "found" ? undefined : gk.detail });
	if (gk.status === "found") out.push(subCheck("grok", "GET cli-chat-proxy.grok.com/v1/billing", await probe("grok")));
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
