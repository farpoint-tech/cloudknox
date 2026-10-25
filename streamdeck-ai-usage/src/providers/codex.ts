import fs from "node:fs/promises";
import { getJson, num, pick } from "../http.js";
import { readSecret } from "../keychain.js";
import { CODEX_AUTH } from "../paths.js";
import { resetWindowName } from "../resets.js";
import { httpStatus, localTokensFor, windowLabel } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, type Provider, type ResetEvent, type Window } from "./types.js";

export const OPENAI_ADMIN = "openai-admin";

export type CodexCred = { status: "found"; token: string; accountId?: string } | { status: "missing" | "invalid"; detail: string };

export async function readCodexCred(): Promise<CodexCred> {
	let raw: string;
	try {
		raw = await fs.readFile(CODEX_AUTH, "utf8");
	} catch {
		return { status: "missing", detail: "~/.codex/auth.json fehlt" };
	}
	try {
		const o = JSON.parse(raw) as any;
		const token = o?.tokens?.access_token;
		if (typeof token !== "string" || !token) return { status: "invalid", detail: "tokens.access_token fehlt" };
		return { status: "found", token, accountId: o.tokens.account_id };
	} catch {
		return { status: "invalid", detail: "kein JSON" };
	}
}

function toIso(v: unknown): string | undefined {
	const n = num(v);
	if (n !== undefined) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
	return typeof v === "string" ? v : undefined;
}

/** Maps GET /backend-api/wham/usage onto windows (secondary_window may be null). */
export function mapCodexUsage(json: unknown): { primary?: Window; secondary?: Window; plan?: string } {
	const win = (key: string): Window | undefined => {
		const w = pick(json, "rate_limit", key);
		const pct = num(pick(w, "used_percent"));
		if (!w || pct === undefined) return undefined;
		return { label: windowLabel(num(pick(w, "limit_window_seconds"))), pct, resetAt: toIso(pick(w, "reset_at")) };
	};
	const plan = pick(json, "plan_type");
	return { primary: win("primary_window"), secondary: win("secondary_window"), plan: typeof plan === "string" ? plan : undefined };
}

/** Resets of wham/usage: primary_window and secondary_window (may be null), named by limit_window_seconds. */
export function codexResets(json: unknown): ResetEvent[] {
	const out: ResetEvent[] = [];
	for (const key of ["primary_window", "secondary_window"]) {
		const w = pick(json, "rate_limit", key);
		const at = w ? toIso(pick(w, "reset_at")) : undefined;
		if (!at || !Number.isFinite(Date.parse(at))) continue;
		out.push({ provider: "codex", window: resetWindowName(num(pick(w, "limit_window_seconds"))), resetsAt: new Date(at).toISOString(), pct: num(pick(w, "used_percent")) });
	}
	return out;
}

/** Sums an OpenAI organization/costs page; amount.value is in dollars. */
export function sumOpenAICost(json: unknown): number {
	let usd = 0;
	const data = pick(json, "data");
	if (!Array.isArray(data)) return 0;
	for (const bucket of data) {
		const results = pick(bucket, "results");
		if (!Array.isArray(results)) continue;
		for (const r of results) usd += num(pick(r, "amount", "value")) ?? 0;
	}
	return usd;
}

export const codex: Provider = {
	id: "codex",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const cred = await readCodexCred();
			if (cred.status !== "found") return subOnly("codex", { status: "login", detail: cred.detail, fetchedAt });
			const headers: Record<string, string> = { Authorization: `Bearer ${cred.token}` };
			if (cred.accountId) headers["ChatGPT-Account-Id"] = cred.accountId;
			const r = await getJson("https://chatgpt.com/backend-api/wham/usage", headers);
			if (r.kind !== "ok") return subOnly("codex", { ...httpStatus(r), fetchedAt });
			const m = mapCodexUsage(r.json);
			if (!m.primary) return subOnly("codex", { status: "error", detail: "rate_limit fehlt", plan: m.plan, fetchedAt });
			// Show the tighter window as primary when both exist.
			if (m.secondary && m.secondary.pct > m.primary.pct) [m.primary, m.secondary] = [m.secondary, m.primary];
			return subOnly("codex", { status: "ok", ...m, resets: codexResets(r.json), fetchedAt });
		}, (detail) => subOnly("codex", { status: "error", detail, fetchedAt: nowIso() })),

	localTokens: (sinceIso) => localTokensFor("codex", sinceIso),

	apiCost: (monthStartIso) =>
		guard(async () => {
			const month = monthLabel(monthStartIso);
			const fetchedAt = nowIso();
			const key = await readSecret(OPENAI_ADMIN);
			if (key.status === "missing") return apiOnly("codex", { status: "key_missing", month, fetchedAt });
			if (key.status === "error") return apiOnly("codex", { status: "error", month, detail: key.detail, fetchedAt });
			let usd = 0;
			let page: string | undefined;
			for (let i = 0; i < 10; i++) {
				const q = new URLSearchParams({
					start_time: String(Math.floor(new Date(monthStartIso).getTime() / 1000)),
					bucket_width: "1d",
					limit: "31",
				});
				if (page) q.set("page", page);
				const r = await getJson(`https://api.openai.com/v1/organization/costs?${q}`, { Authorization: `Bearer ${key.value}` });
				if (r.kind !== "ok") return apiOnly("codex", { ...httpStatus(r), month, fetchedAt });
				usd += sumOpenAICost(r.json);
				const next = pick(r.json, "next_page");
				if (pick(r.json, "has_more") !== true || typeof next !== "string") break;
				page = next;
			}
			return apiOnly("codex", { status: "ok", usd, month, fetchedAt });
		}, (detail) => apiOnly("codex", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() })),
};
