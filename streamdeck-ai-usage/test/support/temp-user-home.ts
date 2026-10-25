// Imported first by grok.test.ts: fresh temp dirs for state.json and for the user home (~/.grok/auth.json) before src/paths.ts reads the env.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const base = process.env.TMPDIR ?? os.tmpdir();
process.env.AI_USAGE_DECK_HOME = fs.mkdtempSync(path.join(base, "aiusage-test-"));
process.env.AI_USAGE_DECK_USER_HOME = fs.mkdtempSync(path.join(base, "aiusage-home-"));
fs.mkdirSync(path.join(process.env.AI_USAGE_DECK_USER_HOME, ".grok"), { mode: 0o700 });
