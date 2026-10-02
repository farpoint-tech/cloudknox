import { Domain, Finding } from "../engine/types";

/**
 * Finding shown for a desktop-only domain when the app runs in the browser.
 * These domains need data outside the browser sandbox (no-CORS REST or local
 * PowerShell), so they only run in the Tauri desktop build.
 */
export function desktopOnlyFinding(domain: Domain, title: string, reason: string): Finding {
  return {
    id: `${domain}.desktop-only`,
    domain,
    title,
    status: "manual",
    severity: "info",
    summary: `${reason} — available in the desktop app.`,
    recommendation:
      "Run the M365 Assessment desktop build to include this domain; the web app covers Graph-based checks only.",
  };
}

/**
 * Normalise the JSON emitted by `... | ConvertTo-Json` into an array. PowerShell
 * emits a bare object for a single result and omits output entirely for none.
 */
export function parsePowerShellJson<T>(stdout: string): T[] {
  const trimmed = (stdout ?? "").trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as T | T[];
  return Array.isArray(parsed) ? parsed : [parsed];
}
