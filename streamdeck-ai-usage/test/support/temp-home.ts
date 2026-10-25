// Imported first by gate.test.ts: points state.json at a fresh temp dir before src/paths.ts reads the env.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.AI_USAGE_DECK_HOME = fs.mkdtempSync(path.join(process.env.TMPDIR ?? os.tmpdir(), "aiusage-test-"));
