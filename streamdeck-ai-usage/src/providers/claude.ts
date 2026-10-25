import fs from "node:fs/promises";
import { getJson, num, pick } from "../http.js";
import { readSecret } from "../keychain.js";
import { CLAUDE_CRED_FILE } from "../paths.js";
import { isoOrUndefined } from "../resets.js";
import { httpStatus, localTokensFor } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, type CostItem, type Provider, type ResetEvent, type SubPart, type Window } from "./types.js";

export const CLAUDE_KEYCHAIN = "Claude Code-credentials";
export const ANTHROPIC_ADMIN = "anthropic-admin";

export type ClaudeCred = { status: "found"; token: string; expiresAt?: number; plan?: string } | { status: "missing" | "invalid"; detail: string };

/** Reads the Claude Code OAuth credential: keychain first, then ~/.claude/.credentials.json. */
export async function readClaudeCred(): Promise<ClaudeCred> {
	let raw: string | undefined;
	const k = await readSecret(CLAUDE_KEYCHAIN);
	if (k.status === "found") raw = k.value;
	else {
		try {
			raw = await fs.readFile(CLAUDE_CRED_FILE, "utf8");
		} catch {
			return { status: "missing", detail: k.status === "error" ? k.detail : "kein Keychain-Eintrag, keine Datei" };
		}
	}
	try {
		const o = JSON.parse(raw) as any;
		const token = o?.claudeAiOauth?.accessToken;
		if (typeof token !== "string" || !token) return { status: "invalid", detail: "accessToken fehlt" };
		return { status: "found", token, expiresAt: num(o.claudeAiOauth.expiresAt), plan: o.claudeAiOauth.subscriptionType };
	} catch {
		return { status: "invalid", detail: "kein JSON" };
	}
}

/** Maps GET /api/oauth/usage onto windows. */
export function mapClaudeUsage(json: unknown): { primary?: Window; secondary?: Window } {
	const win = (key: string, label: string): Window | undefined => {
		const pct = num(pick(json, key, "utilization"));
		if (pct === undefined) return undefined;
		const r = pick(json, key, "resets_at");
		return { label, pct, resetAt: typeof r === "string" ? r : undefined };
	};
	return { primary: win("five_hour", "5h"), secondary: win("seven_day", "Wo") };
}

/**
 * Resets reported by GET /api/oauth/usage: five_hour → "5h", seven_day → "Woche",
 * extra_usage → "Extra" only when the object carries a reset time (live response 2026-10-25 has none).
 */
export function claudeResets(json: unknown): ResetEvent[] {
	const out: ResetEvent[] = [];
	for (const [key, window] of [["five_hour", "5h"], ["seven_day", "Woche"]] as const) {
		const at = isoOrUndefined(pick(json, key, "resets_at"));
		if (at) out.push({ provider: "claude", window, resetsAt: at, pct: num(pick(json, key, "utilization")) });
	}
	const extra = pick(json, "extra_usage");
	const extraAt = isoOrUndefined(pick(extra, "resets_at") ?? pick(extra, "reset_at") ?? pick(extra, "next_reset_at") ?? pick(extra, "period_end"));
	if (extraAt) out.push({ provider: "claude", window: "Extra", resetsAt: extraAt, pct: num(pick(extra, "utilization")) });
	for (const b of claudeBudgets(json)) {
		if (b.resetAt) out.push({ provider: "claude", window: "Budget", resetsAt: b.resetAt, pct: b.pct });
	}
	return out;
}

/**
 * Every top-level object carrying `limit_dollars > 0` (live 2026-10-25: an object named `iguana_necktie`,
 * limit 250, used 251.2). The key names are internal and change, so none is hard-coded.
 * five_hour/seven_day carry limit_dollars: null and are skipped.
 */
export function claudeBudgets(json: unknown): CostItem[] {
	const out: CostItem[] = [];
	if (!json || typeof json !== "object") return out;
	for (const v of Object.values(json as Record<string, unknown>)) {
		if (!v || typeof v !== "object" || Array.isArray(v)) continue;
		const limit = num(pick(v, "limit_dollars"));
		if (limit === undefined || limit <= 0) continue;
		const used = num(pick(v, "used_dollars"));
		const remaining = num(pick(v, "remaining_dollars"));
		const pct = num(pick(v, "utilization")) ?? (used !== undefined ? (used / limit) * 100 : undefined);
		const item: CostItem = { label: "Budget", used, limit, currency: "USD", pct, resetAt: isoOrUndefined(pick(v, "resets_at")) };
		item.reached = (used !== undefined && used >= limit) || remaining === 0;
		out.push(item);
	}
	return out;
}

/**
 * Subscription costs of GET /api/oauth/usage: extra_usage (amounts in minor units, scaled by decimal_places –
 * live 2026-10-25: monthly_limit 2500, decimal_places 2 = 25,00 EUR, matching spend.limit.amount_minor/exponent)
 * plus the dollar budgets of claudeBudgets().
 */
export function claudeCost(json: unknown): CostItem[] {
	const out: CostItem[] = [];
	const extra = pick(json, "extra_usage");
	if (extra && typeof extra === "object") {
		const dp = num(pick(extra, "decimal_places")) ?? 0;
		const scale = (v: unknown) => {
			const n = num(v);
			return n === undefined ? undefined : n / 10 ** dp;
		};
		const enabled = pick(extra, "is_enabled") === true;
		const reached = pick(extra, "spend_limit_reached") === true;
		const currency = pick(extra, "currency");
		const item: CostItem = {
			label: "Extra",
			used: scale(pick(extra, "used_credits")),
			limit: scale(pick(extra, "monthly_limit")),
			currency: typeof currency === "string" ? currency : undefined,
			pct: num(pick(extra, "utilization")),
			reached,
			resetAt: isoOrUndefined(pick(extra, "resets_at") ?? pick(extra, "reset_at") ?? pick(extra, "next_reset_at") ?? pick(extra, "period_end")),
		};
		if (reached) item.state = "Limit erreicht";
		else if (!enabled) item.state = "aus";
		const reason = pick(extra, "disabled_reason");
		if (!enabled && typeof reason === "string") item.note = reason;
		out.push(item);
	}
	out.push(...claudeBudgets(json));
	return out;
}

/** Sums an Anthropic cost_report page; amounts are decimal strings in cents. */
export function sumAnthropicCost(json: unknown): number {
	let cents = 0;
	const data = pick(json, "data");
	if (!Array.isArray(data)) return 0;
	for (const bucket of data) {
		const results = pick(bucket, "results");
		if (!Array.isArray(results)) continue;
		for (const r of results) cents += num(pick(r, "amount")) ?? 0;
	}
	return cents / 100;
}

export const claude: Provider = {
	id: "claude",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const cred = await readClaudeCred();
			if (cred.status !== "found") return subOnly("claude", { status: "login", detail: cred.detail, fetchedAt });
			if (cred.expiresAt && cred.expiresAt < Date.now()) {
				// Do not refresh ourselves: Claude Code owns the refresh token.
				return subOnly("claude", { status: "login", detail: "Token abgelaufen – Claude Code öffnen", plan: cred.plan, fetchedAt });
			}
			const r = await getJson("https://api.anthropic.com/api/oauth/usage", {
				Authorization: `Bearer ${cred.token}`,
				"anthropic-beta": "oauth-2025-04-20",
			});
			if (r.kind !== "ok") {
				const h = httpStatus(r);
				return subOnly("claude", { ...h, detail: h.status === "login" ? "Claude Code öffnen" : h.detail, plan: cred.plan, fetchedAt });
			}
			const w = mapClaudeUsage(r.json);
			const sub: SubPart = { status: w.primary ? "ok" : "error", ...w, plan: cred.plan, resets: claudeResets(r.json), cost: claudeCost(r.json), fetchedAt };
			if (!w.primary) sub.detail = "five_hour fehlt";
			return subOnly("claude", sub);
		}, (detail) => subOnly("claude", { status: "error", detail, fetchedAt: nowIso() })),

	localTokens: (sinceIso) => localTokensFor("claude", sinceIso),

	apiCost: (monthStartIso) =>
		guard(async () => {
			const month = monthLabel(monthStartIso);
			const fetchedAt = nowIso();
			const key = await readSecret(ANTHROPIC_ADMIN);
			if (key.status === "missing") return apiOnly("claude", { status: "key_missing", month, fetchedAt });
			if (key.status === "error") return apiOnly("claude", { status: "error", month, detail: key.detail, fetchedAt });
			let usd = 0;
			let page: string | undefined;
			for (let i = 0; i < 10; i++) {
				const q = new URLSearchParams({
					starting_at: new Date(monthStartIso).toISOString(),
					ending_at: new Date().toISOString(),
					bucket_width: "1d",
					limit: "31",
				});
				if (page) q.set("page", page);
				const r = await getJson(`https://api.anthropic.com/v1/organizations/cost_report?${q}`, {
					"x-api-key": key.value,
					"anthropic-version": "2023-06-01",
				});
				if (r.kind !== "ok") return apiOnly("claude", { ...httpStatus(r), month, fetchedAt });
				usd += sumAnthropicCost(r.json);
				const next = pick(r.json, "next_page");
				if (pick(r.json, "has_more") !== true || typeof next !== "string") break;
				page = next;
			}
			return apiOnly("claude", { status: "ok", usd, month, fetchedAt });
		}, (detail) => apiOnly("claude", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() })),
};
