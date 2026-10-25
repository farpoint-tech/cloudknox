import fs from "node:fs/promises";
import { localDay } from "../format.js";
import { readNewLines } from "../lines.js";
import type { ProviderId } from "../providers/types.js";
import type { FileState, State } from "../store.js";

export const FIRST_RUN_DAYS = 7;
export const RETENTION_DAYS = 35;

export function cutoffDay(s: State, provider: ProviderId, now = new Date()): string {
	const days = s.initialized[provider] ? RETENTION_DAYS : FIRST_RUN_DAYS;
	return localDay(new Date(now.getTime() - days * 86_400_000));
}

/**
 * Incrementally reads new lines of each file. On the first run of a provider, files whose mtime
 * is older than FIRST_RUN_DAYS are only bookmarked (offset = size), never read.
 */
export async function scanFiles(
	s: State,
	provider: ProviderId,
	files: string[],
	onLine: (line: string, fileState: FileState) => void,
): Promise<{ read: number; skipped: number }> {
	const firstRun = !s.initialized[provider];
	const firstCutoffMs = Date.now() - FIRST_RUN_DAYS * 86_400_000;
	let read = 0;
	let skipped = 0;
	for (const file of files) {
		let st;
		try {
			st = await fs.stat(file);
		} catch {
			continue;
		}
		let fsState = s.files[file];
		if (!fsState) {
			if (firstRun && st.mtimeMs < firstCutoffMs) {
				s.files[file] = { offset: st.size, size: st.size, mtimeMs: st.mtimeMs };
				skipped++;
				continue;
			}
			fsState = s.files[file] = { offset: 0, size: 0, mtimeMs: 0 };
		}
		if (st.size === fsState.size && st.mtimeMs === fsState.mtimeMs) continue;
		if (st.size < fsState.offset) {
			// File was rewritten or truncated: start over, forget cumulative extras.
			fsState.offset = 0;
			delete fsState.extra;
		}
		try {
			fsState.offset = await readNewLines(file, fsState.offset, (line) => onLine(line, fsState));
		} catch {
			continue; // unreadable file: keep old offset, try again next run
		}
		fsState.size = st.size;
		fsState.mtimeMs = st.mtimeMs;
		read++;
	}
	return { read, skipped };
}

/** Removes bookmarks for files that no longer exist under `prefix`. */
export function forgetMissing(s: State, prefix: string, existing: string[]): void {
	const set = new Set(existing);
	for (const f of Object.keys(s.files)) if (f.startsWith(prefix) && !set.has(f)) delete s.files[f];
}
