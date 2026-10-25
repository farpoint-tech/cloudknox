import { localDay } from "../format.js";
import { listFiles } from "../lines.js";
import { CODEX_SESSIONS } from "../paths.js";
import { addBucket, type Bucket, type State } from "../store.js";
import { cutoffDay, forgetMissing, scanFiles } from "./scan.js";

export interface CodexTotals {
	input: number;
	cached: number;
	output: number;
}

/** Parses a Codex `token_count` event; returns cumulative session totals. */
export function parseCodexLine(line: string): { day: string; total: CodexTotals } | null {
	if (!line.includes('"token_count"')) return null;
	let o: any;
	try {
		o = JSON.parse(line);
	} catch {
		return null;
	}
	const p = o?.payload;
	const t = p?.type === "token_count" ? p?.info?.total_token_usage : undefined;
	if (!t || typeof o.timestamp !== "string") return null;
	const d = new Date(o.timestamp);
	if (Number.isNaN(d.getTime())) return null;
	const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
	return { day: localDay(d), total: { input: n(t.input_tokens), cached: n(t.cached_input_tokens), output: n(t.output_tokens) } };
}

/**
 * Converts cumulative totals into a delta against the previous event of the same session.
 * Repeated events yield a zero delta; a counter reset is treated as a fresh start.
 * OpenAI semantics: input_tokens includes cached_input_tokens.
 */
export function codexDelta(prev: CodexTotals | undefined, cur: CodexTotals): Bucket {
	const reset = !prev || cur.input < prev.input || cur.output < prev.output || cur.cached < prev.cached;
	const base = reset ? { input: 0, cached: 0, output: 0 } : prev!;
	const dIn = cur.input - base.input;
	const dCached = cur.cached - base.cached;
	return { in: Math.max(0, dIn - dCached), cached: Math.max(0, dCached), out: Math.max(0, cur.output - base.output) };
}

export async function collectCodex(s: State): Promise<void> {
	const files = await listFiles(CODEX_SESSIONS, (n) => n.endsWith(".jsonl"));
	const minDay = cutoffDay(s, "codex");
	await scanFiles(s, "codex", files, (line, fsState) => {
		const p = parseCodexLine(line);
		if (!p) return;
		const prev = fsState.extra ? { input: fsState.extra.i ?? 0, cached: fsState.extra.c ?? 0, output: fsState.extra.o ?? 0 } : undefined;
		const delta = codexDelta(prev, p.total);
		// Always advance the baseline, even for events older than the window.
		fsState.extra = { i: p.total.input, c: p.total.cached, o: p.total.output };
		if (p.day >= minDay) addBucket(s, "codex", p.day, delta);
	});
	forgetMissing(s, CODEX_SESSIONS, files);
	s.initialized.codex ??= new Date().toISOString();
}
