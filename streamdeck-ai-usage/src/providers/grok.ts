import fs from "node:fs/promises";
import { getJson, num, pick } from "../http.js";
import { readSecret } from "../keychain.js";
import { GROK_AUTH } from "../paths.js";
import { isoOrUndefined } from "../resets.js";
import { httpStatus } from "./common.js";
import { apiOnly, guard, monthLabel, nowIso, subOnly, tokensOnly, type Provider } from "./types.js";

export const XAI_MANAGEMENT = "xai-management";
export const XAI_TEAM_ID = "xai-team-id";

export type GrokCred = { status: "found"; token: string; expiresAt?: number } | { status: "missing" | "invalid"; detail: string };

/** Community format of ~/.grok/auth.json is not documented; accept the common token field names. */
export async function readGrokCred(): Promise<GrokCred> {
	let raw: string;
	try {
		raw = await fs.readFile(GROK_AUTH, "utf8");
	} catch {
		return { status: "missing", detail: "~/.grok/auth.json fehlt (grok login)" };
	}
	try {
		const o = JSON.parse(raw) as any;
		const token = o?.access_token ?? o?.accessToken ?? o?.tokens?.access_token ?? o?.id_token;
		if (typeof token !== "string" || !token) return { status: "invalid", detail: "kein access_token" };
		const exp = num(o?.expires_at ?? o?.expiresAt ?? o?.expiry);
		return { status: "found", token, expiresAt: exp === undefined ? undefined : exp < 1e12 ? exp * 1000 : exp };
	} catch {
		return { status: "invalid", detail: "kein JSON" };
	}
}

/** Cent amounts may arrive as number, string or {val}. */
export function centsOf(v: unknown): number | undefined {
	return num(v) ?? num(pick(v, "val"));
}

export const grok: Provider = {
	id: "grok",

	subscription: () =>
		guard(async () => {
			const fetchedAt = nowIso();
			const cred = await readGrokCred();
			if (cred.status !== "found") return subOnly("grok", { status: "login", detail: cred.detail, fetchedAt });
			if (cred.expiresAt && cred.expiresAt < Date.now()) return subOnly("grok", { status: "login", detail: "Token abgelaufen (grok login)", fetchedAt });
			const r = await getJson("https://cli-chat-proxy.grok.com/v1/billing?format=credits", { Authorization: `Bearer ${cred.token}` });
			if (r.kind !== "ok") return subOnly("grok", { ...httpStatus(r), fetchedAt });
			const pct = num(pick(r.json, "creditUsagePercent"));
			const end = pick(r.json, "currentPeriod", "end") ?? pick(r.json, "currentPeriod", "endTime");
			if (pct === undefined) return subOnly("grok", { status: "error", detail: "creditUsagePercent fehlt", fetchedAt });
			const resetAt = isoOrUndefined(end);
			return subOnly("grok", {
				status: "ok",
				primary: { label: "Mo", pct, resetAt },
				resets: resetAt ? [{ provider: "grok", window: "Monat", resetsAt: resetAt, pct }] : [],
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
