import fs from "node:fs/promises";

const CHUNK = 1 << 20;

/** Yield to the event loop so the Stream Deck connection stays responsive. */
export const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

/**
 * Reads complete lines from `file` starting at byte `offset`.
 * Returns the offset just after the last complete line (a trailing partial line is left for next time).
 */
export async function readNewLines(
	file: string,
	offset: number,
	onLine: (line: string) => void,
): Promise<number> {
	const fh = await fs.open(file, "r");
	try {
		const buf = Buffer.alloc(CHUNK);
		let carry: Buffer = Buffer.alloc(0);
		let pos = offset;
		let consumed = offset;
		let count = 0;
		for (;;) {
			const { bytesRead } = await fh.read(buf, 0, CHUNK, pos);
			if (bytesRead === 0) break;
			pos += bytesRead;
			const data = carry.length ? Buffer.concat([carry, buf.subarray(0, bytesRead)]) : buf.subarray(0, bytesRead);
			let start = 0;
			let nl: number;
			while ((nl = data.indexOf(0x0a, start)) !== -1) {
				if (nl > start) onLine(data.toString("utf8", start, nl));
				consumed += nl - start + 1;
				start = nl + 1;
				if (++count % 2000 === 0) await yieldLoop();
			}
			carry = Buffer.from(data.subarray(start));
			await yieldLoop();
		}
		return consumed;
	} finally {
		await fh.close();
	}
}

/** Recursively lists files under `dir` matching `pred`; missing dir yields []. */
export async function listFiles(dir: string, pred: (name: string) => boolean): Promise<string[]> {
	try {
		const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
		return entries
			.filter((e) => e.isFile() && pred(e.name))
			.map((e) => `${e.parentPath}/${e.name}`);
	} catch {
		return [];
	}
}
