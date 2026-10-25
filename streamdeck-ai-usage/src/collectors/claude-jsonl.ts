import { localDay } from "../format.js";
import { listFiles } from "../lines.js";
import { CLAUDE_PROJECTS } from "../paths.js";
import { addBucket, type Bucket, type State } from "../store.js";
import { cutoffDay, forgetMissing, scanFiles } from "./scan.js";

export interface ClaudeUsageLine extends Bucket {
	key: string;
	day: string;
}

/** Parses one Claude Code transcript line; null if it carries no usage. */
export function parseClaudeLine(line: string): ClaudeUsageLine | null {
	if (!line.includes('"usage"')) return null;
	let o: any;
	try {
		o = JSON.parse(line);
	} catch {
		return null;
	}
	const u = o?.message?.usage;
	if (!u || typeof u !== "object" || typeof o.timestamp !== "string") return null;
	const t = new Date(o.timestamp);
	if (Number.isNaN(t.getTime())) return null;
	const id = o.message?.id ?? o.uuid ?? "";
	const req = o.requestId ?? "";
	const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
	return {
		key: `${id}:${req}`,
		day: localDay(t),
		in: n(u.input_tokens) + n(u.cache_creation_input_tokens),
		cached: n(u.cache_read_input_tokens),
		out: n(u.output_tokens),
	};
}

export async function collectClaude(s: State): Promise<void> {
	const files = await listFiles(CLAUDE_PROJECTS, (n) => n.endsWith(".jsonl"));
	const minDay = cutoffDay(s, "claude");
	await scanFiles(s, "claude", files, (line) => {
		const p = parseClaudeLine(line);
		if (!p || p.day < minDay) return;
		if (s.claudeSeen[p.key]) return; // dedupe message.id + requestId (streamed repeats, resumed sessions)
		s.claudeSeen[p.key] = p.day;
		addBucket(s, "claude", p.day, p);
	});
	forgetMissing(s, CLAUDE_PROJECTS, files);
	s.initialized.claude ??= new Date().toISOString();
}
