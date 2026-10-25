import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG_DIR, HISTORY_FILE, LOCK_FILE, STATE_FILE } from "./paths.js";
import type { ProviderId, SubPart } from "./providers/types.js";

export interface FileState {
	offset: number;
	size: number;
	mtimeMs: number;
	/** Collector-specific data (e.g. last Codex cumulative totals). */
	extra?: Record<string, number>;
}

export interface Bucket {
	in: number;
	out: number;
	cached: number;
}

/** Per-provider cooldown after 429/5xx of the subscription endpoint (shared by plugin and CLI). */
export interface GateEntry {
	kind: "429" | "5xx";
	/** Consecutive failures of this kind. */
	strikes: number;
	/** Epoch ms; the endpoint is not called before this. */
	cooldownUntil: number;
	lastCode?: number;
	/** First failure of the current streak (ISO). */
	since?: string;
}

export interface State {
	version: 1;
	/** file path -> read position */
	files: Record<string, FileState>;
	/** provider -> local day -> token sums */
	buckets: Partial<Record<ProviderId, Record<string, Bucket>>>;
	/** Claude dedupe keys (message.id+requestId) -> local day */
	claudeSeen: Record<string, string>;
	/** Gemini message ids already counted -> local day */
	geminiSeen: Record<string, string>;
	/** Copilot session id -> last cumulative totals */
	copilotSessions: Record<string, Bucket>;
	/** Whether a collector has completed its first (7-day) run. */
	initialized: Partial<Record<ProviderId, string>>;
	/** Whether any Gemini record ever carried token fields. */
	geminiHasUsage?: boolean;
	/** Last successful subscription value per provider (with fetchedAt); written on every good fetch. */
	lastSub: Partial<Record<ProviderId, SubPart>>;
	subGate: Partial<Record<ProviderId, GateEntry>>;
	/**
	 * Providers whose API-key costs (Enterprise/Teams admin keys) are switched on via the provider-key setting
	 * showApiCost. Written by the plugin, read by the weekly reconcile (launchd). Absent = none.
	 */
	apiProviders?: ProviderId[];
	/**
	 * Entra tenant (GUID or domain) for M365 Copilot, from the provider-key setting tenantId. Written by the plugin,
	 * read by CLI and reconcile; AI_USAGE_DECK_M365_TENANT is the fallback when absent.
	 */
	m365TenantId?: string;
	/** M365 Copilot auth mode from the key setting m365Auth: "az" (default) or "app" (client credentials). */
	m365Auth?: "az" | "app";
	/** App mode: application (client) ID and the UPN whose license/usage is shown, as entered (validated when read). */
	m365ClientId?: string;
	m365Upn?: string;
	lastTokensRun?: string;
	lastApiRun?: string;
	lastReconcile?: string;
}

export function emptyState(): State {
	return {
		version: 1,
		files: {},
		buckets: {},
		claudeSeen: {},
		geminiSeen: {},
		copilotSessions: {},
		initialized: {},
		lastSub: {},
		subGate: {},
	};
}

export async function loadState(): Promise<State> {
	try {
		const raw = JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as Partial<State>;
		return { ...emptyState(), ...raw, version: 1 };
	} catch {
		return emptyState();
	}
}

async function saveState(s: State): Promise<void> {
	await fs.mkdir(CONFIG_DIR, { recursive: true });
	const tmp = `${STATE_FILE}.${process.pid}.tmp`;
	await fs.writeFile(tmp, JSON.stringify(s));
	await fs.rename(tmp, STATE_FILE);
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Serialises every read-modify-write of state.json inside this process.
 * State is reloaded from disk each time so CLI runs and the plugin see each other's progress.
 */
export function withState<T>(fn: (s: State) => Promise<T> | T): Promise<T> {
	const run = chain.then(async () => {
		const s = await loadState();
		const result = await fn(s);
		await saveState(s);
		return result;
	});
	chain = run.catch(() => undefined);
	return run;
}

export async function appendHistory(lines: object[]): Promise<void> {
	await fs.mkdir(CONFIG_DIR, { recursive: true });
	await fs.appendFile(HISTORY_FILE, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

/** Cross-process lock for the weekly reconcile (plugin + launchd). Stale after 10 min. */
export async function tryLock(): Promise<(() => Promise<void>) | undefined> {
	await fs.mkdir(path.dirname(LOCK_FILE), { recursive: true });
	try {
		const st = await fs.stat(LOCK_FILE);
		if (Date.now() - st.mtimeMs > 10 * 60_000) await fs.rm(LOCK_FILE, { force: true });
	} catch {
		/* no lock present */
	}
	try {
		const fh = await fs.open(LOCK_FILE, "wx");
		await fh.writeFile(String(process.pid));
		await fh.close();
		return () => fs.rm(LOCK_FILE, { force: true });
	} catch {
		return undefined;
	}
}

export function addBucket(s: State, provider: ProviderId, day: string, b: Bucket): void {
	const days = (s.buckets[provider] ??= {});
	const cur = (days[day] ??= { in: 0, out: 0, cached: 0 });
	cur.in += b.in;
	cur.out += b.out;
	cur.cached += b.cached;
}

export function sumBuckets(s: State, provider: ProviderId, sinceDay: string): Bucket {
	const out: Bucket = { in: 0, out: 0, cached: 0 };
	for (const [day, b] of Object.entries(s.buckets[provider] ?? {})) {
		if (day < sinceDay) continue;
		out.in += b.in;
		out.out += b.out;
		out.cached += b.cached;
	}
	return out;
}

/** Drop buckets and dedupe keys older than `keepDay`. */
export function prune(s: State, keepDay: string): void {
	for (const days of Object.values(s.buckets)) {
		for (const day of Object.keys(days ?? {})) if (day < keepDay) delete days![day];
	}
	for (const map of [s.claudeSeen, s.geminiSeen]) {
		for (const [k, day] of Object.entries(map)) if (day < keepDay) delete map[k];
	}
}
