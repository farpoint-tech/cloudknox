import { execFile } from "node:child_process";
import fs from "node:fs";
import { getJson, num, pick } from "../http.js";
import { readSecret } from "../keychain.js";
import { GH_CANDIDATES } from "../paths.js";
import { isoOrUndefined } from "../resets.js";
import { httpStatus, localTokensFor } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, type Provider, type ResetEvent, type Window } from "./types.js";

export const GITHUB_BILLING_PAT = "github-billing-pat";

export type GhToken = { status: "found"; token: string } | { status: "missing" | "invalid"; detail: string };

/** `gh auth token` (reads gh's own keychain item gh:github.com). Never the github-copilot-app item. */
export function readGhToken(): Promise<GhToken> {
	const gh = GH_CANDIDATES.find((p) => fs.existsSync(p));
	if (!gh) return Promise.resolve({ status: "missing", detail: "gh nicht installiert" });
	return new Promise((resolve) => {
		execFile(gh, ["auth", "token", "-h", "github.com"], { timeout: 5000 }, (err, stdout) => {
			const token = stdout.trim();
			if (err || !token) return resolve({ status: "invalid", detail: "gh auth refresh -h github.com" });
			resolve({ status: "found", token });
		});
	});
}

const COPILOT_HEADERS = {
	"Editor-Version": "vscode/1.99.0",
	"Editor-Plugin-Version": "copilot-chat/0.26.0",
	"Copilot-Integration-Id": "vscode-chat",
	"User-Agent": "GitHubCopilotChat/0.26.0",
};

/**
 * Maps copilot_internal/user quota_snapshots onto windows (monthly reset).
 * Premium requests are primary when the plan has any; otherwise (e.g. free plan,
 * entitlement 0) chat is primary and completions secondary.
 */
export function mapCopilotUser(json: unknown): { primary?: Window; secondary?: Window; plan?: string } {
	const plan = pick(json, "copilot_plan");
	const reset = pick(json, "quota_reset_date");
	const resetAt = typeof reset === "string" ? new Date(reset).toISOString() : undefined;
	const planStr = typeof plan === "string" ? plan : undefined;
	const win = (key: string, label: string): Window | undefined => {
		const q = pick(json, "quota_snapshots", key);
		if (!q) return undefined;
		if (pick(q, "unlimited") === true) return { label: `${label} ∞`, pct: 0, resetAt };
		const entitlement = num(pick(q, "entitlement"));
		if (entitlement === 0) return undefined; // not part of this plan
		const remaining = num(pick(q, "percent_remaining"));
		if (remaining === undefined) return undefined;
		return { label, pct: Math.min(100, Math.max(0, 100 - remaining)), resetAt };
	};
	const premium = win("premium_interactions", "Prem");
	const chat = win("chat", "Chat");
	const completions = win("completions", "Code");
	const ordered = [premium, chat, completions].filter((w): w is Window => !!w);
	return { primary: ordered[0], secondary: ordered[1], plan: planStr };
}

/** Monthly reset from quota_reset_date; pct of the window shown as primary. */
export function copilotResets(json: unknown): ResetEvent[] {
	const at = isoOrUndefined(pick(json, "quota_reset_date"));
	if (!at) return [];
	return [{ provider: "copilot", window: "Monat", resetsAt: at, pct: mapCopilotUser(json).primary?.pct }];
}

/** Sums premium_request usage netAmount (dollars). */
export function sumCopilotBilling(json: unknown): number {
	const items = pick(json, "usageItems");
	if (!Array.isArray(items)) return 0;
	return items.reduce((a: number, it) => a + (num(pick(it, "netAmount")) ?? 0), 0);
}

export const copilot: Provider = {
	id: "copilot",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const t = await readGhToken();
			if (t.status !== "found") return subOnly("copilot", { status: "login", detail: t.detail, fetchedAt });
			const r = await getJson("https://api.github.com/copilot_internal/user", { Authorization: `Bearer ${t.token}`, ...COPILOT_HEADERS });
			if (r.kind !== "ok") {
				const h = httpStatus(r);
				return subOnly("copilot", { ...h, detail: h.status === "login" ? "gh auth refresh -h github.com" : h.detail, fetchedAt });
			}
			const m = mapCopilotUser(r.json);
			if (!m.primary) return subOnly("copilot", { status: "error", detail: "quota_snapshots fehlt", plan: m.plan, fetchedAt });
			return subOnly("copilot", { status: "ok", ...m, resets: copilotResets(r.json), fetchedAt });
		}, (detail) => subOnly("copilot", { status: "error", detail, fetchedAt: nowIso() })),

	localTokens: (sinceIso) => localTokensFor("copilot", sinceIso),

	apiCost: (monthStartIso) =>
		guard(async () => {
			const month = monthLabel(monthStartIso);
			const fetchedAt = nowIso();
			const key = await readSecret(GITHUB_BILLING_PAT);
			if (key.status === "missing") return apiOnly("copilot", { status: "key_missing", month, fetchedAt });
			if (key.status === "error") return apiOnly("copilot", { status: "error", month, detail: key.detail, fetchedAt });
			const h = { Authorization: `Bearer ${key.value}`, "X-GitHub-Api-Version": "2026-03-10" };
			const me = await getJson("https://api.github.com/user", h);
			if (me.kind !== "ok") return apiOnly("copilot", { ...httpStatus(me), month, fetchedAt });
			const login = pick(me.json, "login");
			if (typeof login !== "string") return apiOnly("copilot", { status: "error", month, detail: "login fehlt", fetchedAt });
			const d = new Date(monthStartIso);
			const q = new URLSearchParams({ year: String(d.getFullYear()), month: String(d.getMonth() + 1) });
			const r = await getJson(`https://api.github.com/users/${encodeURIComponent(login)}/settings/billing/premium_request/usage?${q}`, h);
			if (r.kind !== "ok") return apiOnly("copilot", { ...httpStatus(r), month, fetchedAt });
			return apiOnly("copilot", { status: "ok", usd: sumCopilotBilling(r.json), month, fetchedAt });
		}, (detail) => apiOnly("copilot", { status: "error", month: monthLabel(monthStartIso), detail, fetchedAt: nowIso() })),
};
