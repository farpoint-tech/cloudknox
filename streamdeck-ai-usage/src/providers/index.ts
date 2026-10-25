import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { copilot } from "./copilot.js";
import { m365copilot } from "./m365copilot.js";
import { gemini } from "./gemini.js";
import { grok } from "./grok.js";
import type { Provider, ProviderId } from "./types.js";

export const PROVIDERS: Record<ProviderId, Provider> = { claude, codex, copilot, m365copilot, gemini, grok };
export * from "./types.js";
