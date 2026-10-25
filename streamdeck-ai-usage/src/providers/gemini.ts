import { localTokensFor } from "./common.js";
import { apiOnly, monthLabel, nowIso, subOnly, type Provider } from "./types.js";

/**
 * Gemini v1: no subscription quota (Code Assist retrieveUserQuota answers 403 SUBSCRIPTION_REQUIRED,
 * Antigravity login is phase 2) and no public cost API (BigQuery billing export only).
 */
export const gemini: Provider = {
	id: "gemini",
	subscription: async () =>
		subOnly("gemini", { status: "na", detail: "Quota n/v (Antigravity-Login, Phase 2)", fetchedAt: nowIso() }),
	localTokens: (sinceIso) => localTokensFor("gemini", sinceIso),
	apiCost: async (monthStartIso) =>
		apiOnly("gemini", { status: "na", month: monthLabel(monthStartIso), detail: "kein Kosten-Endpunkt (BigQuery-Export)", fetchedAt: nowIso() }),
};
