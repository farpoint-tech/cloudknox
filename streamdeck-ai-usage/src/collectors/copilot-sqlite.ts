import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { localDay } from "../format.js";
import { COPILOT_DB, SQLITE_BIN } from "../paths.js";
import { addBucket, type Bucket, type State } from "../store.js";
import { cutoffDay } from "./scan.js";

export interface CopilotRow {
	id: string;
	i: number;
	o: number;
	c: number;
	u: string;
}

function sqliteJson(db: string, sql: string): Promise<unknown[]> {
	return new Promise((resolve, reject) => {
		execFile(SQLITE_BIN, ["-readonly", "-json", db, sql], { timeout: 10_000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
			if (err) return reject(new Error(`sqlite3: ${err.message.split("\n")[0]}`));
			const text = stdout.trim();
			resolve(text ? (JSON.parse(text) as unknown[]) : []);
		});
	});
}

/** Delta of a session's cumulative totals; input is assumed to include cached tokens. */
export function copilotDelta(prev: Bucket | undefined, row: CopilotRow): Bucket {
	const p = prev ?? { in: 0, out: 0, cached: 0 };
	const reset = row.i < p.in || row.o < p.out || row.c < p.cached;
	const base = reset ? { in: 0, out: 0, cached: 0 } : p;
	const dIn = row.i - base.in;
	const dCached = row.c - base.cached;
	return { in: Math.max(0, dIn - dCached), cached: Math.max(0, dCached), out: Math.max(0, row.o - base.out) };
}

/**
 * Copilot stores cumulative per-session totals. Deltas since the last run are attributed to
 * the day of `updated_at` (approximation: a long session spanning days is booked on its last day).
 */
export async function collectCopilot(s: State): Promise<boolean> {
	try {
		await fs.access(COPILOT_DB);
	} catch {
		return false;
	}
	const minDay = cutoffDay(s, "copilot");
	const firstRun = !s.initialized.copilot;
	const sinceIso = new Date(Date.now() - 35 * 86_400_000).toISOString();
	const rows = (await sqliteJson(
		COPILOT_DB,
		`SELECT id, total_input_tokens AS i, total_output_tokens AS o, total_cached_tokens AS c, updated_at AS u FROM sessions WHERE updated_at >= '${sinceIso}'`,
	)) as CopilotRow[];
	for (const row of rows) {
		const prev = s.copilotSessions[row.id];
		const delta = copilotDelta(prev, row);
		s.copilotSessions[row.id] = { in: row.i, out: row.o, cached: row.c };
		const d = new Date(row.u);
		if (Number.isNaN(d.getTime())) continue;
		const day = localDay(d);
		if (day < minDay && (firstRun || !prev)) continue;
		addBucket(s, "copilot", day < minDay ? localDay(new Date()) : day, delta);
	}
	s.initialized.copilot ??= new Date().toISOString();
	return true;
}
