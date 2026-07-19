/**
 * Cross-platform wrapper: build the static export for the Tauri desktop bundle.
 * Sets TAURI_BUILD=1 (so next.config.mjs enables `output: 'export'`) and runs
 * `next build`, which emits the static site to ./out.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("next", ["build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TAURI_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" },
});

process.exit(result.status ?? 1);
