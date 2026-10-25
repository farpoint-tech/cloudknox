import { localDay } from "../format.js";
import type { ProviderId } from "../providers/types.js";
import { prune, sumBuckets, withState, type Bucket } from "../store.js";
import { collectClaude } from "./claude-jsonl.js";
import { collectCodex } from "./codex-jsonl.js";
import { collectCopilot } from "./copilot-sqlite.js";
import { collectGemini } from "./gemini-jsonl.js";
import { RETENTION_DAYS } from "./scan.js";

const lastRun = new Map<ProviderId, number>();
const lastAvail = new Map<ProviderId, { available: boolean; detail?: string }>();
const MIN_GAP_MS = 10_000;

export interface Collected extends Bucket {
	/** false if the source does not exist / has no usage fields */
	available: boolean;
	detail?: string;
}

/** Runs the incremental collector for `provider` (skipped if run < 10 s ago) and sums since `sinceIso`. */
export async function collectAndSum(provider: ProviderId, sinceIso: string): Promise<Collected> {
	return withState(async (s) => {
		let available = true;
		let detail: string | undefined;
		const fresh = Date.now() - (lastRun.get(provider) ?? 0) < MIN_GAP_MS;
		if (!fresh) {
			switch (provider) {
				case "claude":
					await collectClaude(s);
					break;
				case "codex":
					await collectCodex(s);
					break;
				case "copilot":
					available = await collectCopilot(s);
					if (!available) detail = "~/.copilot/data.db fehlt";
					break;
				case "gemini":
					await collectGemini(s);
					break;
				case "grok":
					available = false;
					detail = "keine lokalen Logs";
					break;
				case "m365copilot":
					available = false;
					detail = "Microsoft veröffentlicht keine Token-Zahlen";
					break;
			}
			lastRun.set(provider, Date.now());
			lastAvail.set(provider, { available, detail });
			prune(s, localDay(new Date(Date.now() - RETENTION_DAYS * 86_400_000)));
			s.lastTokensRun = new Date().toISOString();
		}
		if (fresh && lastAvail.has(provider)) ({ available, detail } = lastAvail.get(provider)!);
		if (provider === "gemini" && !s.geminiHasUsage) {
			available = false;
			detail = "keine Usage-Felder in Gemini-Logs";
		}
		if (provider === "grok" || provider === "m365copilot") available = false;
		return { available, detail, ...sumBuckets(s, provider, localDay(new Date(sinceIso))) };
	});
}
