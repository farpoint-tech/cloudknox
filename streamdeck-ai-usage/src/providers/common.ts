import { parseRetryAfter, type HttpResult } from "../http.js";
import { collectAndSum } from "../collectors/index.js";
import { nowIso, tokensOnly, type ProviderId, type ProviderSnapshot, type Status } from "./types.js";

/**
 * Maps a failed HTTP result onto a status. 401/403 => login.
 * httpCode and retryAfterMs are passed on so the subscription gate can start a cooldown (429, 5xx).
 */
export function httpStatus(r: Exclude<HttpResult, { kind: "ok" }>): { status: Status; detail: string; httpCode?: number; retryAfterMs?: number } {
	if (r.kind === "offline") return { status: "offline", detail: r.detail };
	if (r.status === 401 || r.status === 403) return { status: "login", detail: `HTTP ${r.status}`, httpCode: r.status };
	const out: { status: Status; detail: string; httpCode?: number; retryAfterMs?: number } = { status: "error", detail: `HTTP ${r.status}`, httpCode: r.status };
	const ra = parseRetryAfter(r.retryAfter);
	if (ra !== undefined) out.retryAfterMs = ra;
	return out;
}

/** Shared localTokens() implementation backed by the incremental collectors. */
export async function localTokensFor(provider: ProviderId, sinceIso: string): Promise<ProviderSnapshot> {
	try {
		const c = await collectAndSum(provider, sinceIso);
		return tokensOnly(provider, {
			status: c.available ? "ok" : "na",
			since: sinceIso,
			in: c.in,
			out: c.out,
			cached: c.cached,
			detail: c.detail,
			fetchedAt: nowIso(),
		});
	} catch (e) {
		return tokensOnly(provider, {
			status: "error",
			since: sinceIso,
			in: 0,
			out: 0,
			cached: 0,
			detail: e instanceof Error ? e.message : String(e),
			fetchedAt: nowIso(),
		});
	}
}

/** Window label from a duration in seconds. */
export function windowLabel(seconds: number | undefined): string {
	if (!seconds) return "";
	if (seconds <= 6 * 3600) return `${Math.round(seconds / 3600)}h`;
	if (seconds <= 8 * 86400) return "Wo";
	return "Mo";
}
