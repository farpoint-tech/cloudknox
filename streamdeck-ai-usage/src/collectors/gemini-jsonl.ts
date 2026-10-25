import { localDay } from "../format.js";
import { listFiles } from "../lines.js";
import { GEMINI_TMP } from "../paths.js";
import { addBucket, type Bucket, type State } from "../store.js";
import { cutoffDay, forgetMissing, scanFiles } from "./scan.js";

/**
 * Parses a Gemini CLI chat record. Field names follow the gemini-cli ChatRecordingService
 * (`type: "gemini"`, `tokens: {input, output, cached, thoughts, tool, total}`); the local
 * files inspected on 2026-10-25 contained no such record yet, so this is unverified locally.
 */
export function parseGeminiLine(line: string): (Bucket & { id: string; day: string }) | null {
	if (!line.includes('"tokens"')) return null;
	let o: any;
	try {
		o = JSON.parse(line);
	} catch {
		return null;
	}
	const t = o?.tokens;
	if (o?.type !== "gemini" || !t || typeof t !== "object" || typeof o.id !== "string") return null;
	const d = new Date(o.timestamp);
	if (Number.isNaN(d.getTime())) return null;
	const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
	const cached = n(t.cached);
	return { id: o.id, day: localDay(d), in: Math.max(0, n(t.input) - cached), cached, out: n(t.output) + n(t.thoughts) };
}

export async function collectGemini(s: State): Promise<void> {
	const files = await listFiles(GEMINI_TMP, (n) => n.startsWith("session-") && n.endsWith(".jsonl"));
	const minDay = cutoffDay(s, "gemini");
	await scanFiles(s, "gemini", files, (line) => {
		const p = parseGeminiLine(line);
		if (!p) return;
		s.geminiHasUsage = true;
		if (p.day < minDay || s.geminiSeen[p.id]) return;
		s.geminiSeen[p.id] = p.day;
		addBucket(s, "gemini", p.day, p);
	});
	forgetMissing(s, GEMINI_TMP, files);
	s.initialized.gemini ??= new Date().toISOString();
}
