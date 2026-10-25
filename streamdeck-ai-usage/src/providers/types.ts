export type ProviderId = "claude" | "codex" | "copilot" | "gemini" | "grok";
export const PROVIDER_IDS: ProviderId[] = ["claude", "codex", "copilot", "gemini", "grok"];

/**
 * ok          value is current
 * login       credential missing/expired/rejected; user must sign in
 * key_missing optional keychain entry not created
 * offline     network failure
 * na          source does not exist for this provider ("n/v")
 * error       unexpected response
 * stale       last good value shown because the current fetch failed or the endpoint is in cooldown
 */
export type Status = "ok" | "login" | "key_missing" | "offline" | "na" | "error" | "stale";

export interface Window {
	/** Short label shown on the key, e.g. "5h", "Wo", "Mo". */
	label: string;
	pct: number;
	resetAt?: string;
}

/** One upcoming quota reset of a subscription window. */
export interface ResetEvent {
	provider: ProviderId;
	/** Window name shown on the key: "5h", "Woche", "Monat", "Extra". */
	window: string;
	/** ISO time of the reset. */
	resetsAt: string;
	/** Utilization of that window in percent, when the endpoint reports it. */
	pct?: number;
}

/**
 * One cost/budget figure of a subscription, taken from the same response as the quota windows
 * (Claude extra_usage + dollar budgets, Codex credits, Copilot overage). Persisted with lastSub.
 */
export interface CostItem {
	/** "Extra", "Budget", "Credits", "Overage". */
	label: string;
	/** Amount used; for Codex credits the balance. Money in `currency`, otherwise a count. */
	used?: number;
	limit?: number;
	/** ISO 4217 code ("EUR", "USD"); absent = a count, not money. */
	currency?: string;
	/** Utilization in percent (drawn as bar). */
	pct?: number;
	/** State text: "aus", "unbegrenzt", "Limit erreicht". */
	state?: string;
	resetAt?: string;
	/** A limit is reached / spending is blocked. */
	reached?: boolean;
	/** No limit (Codex credits unlimited). */
	unlimited?: boolean;
	/** Raw reason for the CLI, e.g. extra_usage.disabled_reason "out_of_credits". */
	note?: string;
}

export interface SubPart {
	status: Status;
	/** Primary window (the one drawn as bar). */
	primary?: Window;
	secondary?: Window;
	plan?: string;
	/** Every reset this endpoint reports (persisted with the last good value in state.json → lastSub). */
	resets?: ResetEvent[];
	/** Subscription costs/budgets from the same response; [] = endpoint reports none. */
	cost?: CostItem[];
	detail?: string;
	fetchedAt: string;
	/** Where the value came from in this refresh: network, shared 55 s cache, or last-good fallback. */
	source?: "net" | "cache" | "stale";
	/** HTTP status of the failed request (or of the failure that started the running cooldown). */
	httpCode?: number;
	/** Parsed Retry-After of a failed response, in ms. */
	retryAfterMs?: number;
	/** ISO time until which the endpoint is not called again. */
	cooldownUntil?: string;
}

export interface TokenPart {
	status: Status;
	since: string;
	in: number;
	out: number;
	cached: number;
	detail?: string;
	fetchedAt: string;
}

export interface ApiPart {
	status: Status;
	/** Month-to-date USD. */
	usd?: number;
	/** "YYYY-MM". */
	month: string;
	detail?: string;
	fetchedAt: string;
}

/** Each provider call fills one part; the hub merges them. */
export interface ProviderSnapshot {
	provider: ProviderId;
	sub?: SubPart;
	tokens?: TokenPart;
	api?: ApiPart;
	/** Status of the part(s) present. */
	status: Status;
}

export interface Provider {
	id: ProviderId;
	subscription(): Promise<ProviderSnapshot>;
	localTokens(sinceIso: string): Promise<ProviderSnapshot>;
	apiCost(monthStartIso: string): Promise<ProviderSnapshot>;
}

export const META: Record<ProviderId, { name: string; abbr: string; color: string }> = {
	claude: { name: "CLAUDE", abbr: "CL", color: "#D97757" },
	codex: { name: "CODEX", abbr: "CX", color: "#10A37F" },
	copilot: { name: "COPILOT", abbr: "CP", color: "#8957E5" },
	gemini: { name: "GEMINI", abbr: "GE", color: "#4285F4" },
	grok: { name: "GROK", abbr: "GK", color: "#E5E5E5" },
};

export function nowIso(): string {
	return new Date().toISOString();
}

export function monthLabel(monthStartIso: string): string {
	const d = new Date(monthStartIso);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function subOnly(provider: ProviderId, sub: SubPart): ProviderSnapshot {
	return { provider, sub, status: sub.status };
}
export function tokensOnly(provider: ProviderId, tokens: TokenPart): ProviderSnapshot {
	return { provider, tokens, status: tokens.status };
}
export function apiOnly(provider: ProviderId, api: ApiPart): ProviderSnapshot {
	return { provider, api, status: api.status };
}

/** Never throw out of a provider call: convert exceptions into an "error" part. */
export async function guard<T>(fn: () => Promise<T>, onError: (detail: string) => T): Promise<T> {
	try {
		return await fn();
	} catch (e) {
		return onError(e instanceof Error ? e.message : String(e));
	}
}
