/**
 * Runtime abstraction that lets the same codebase run as a browser PWA (Graph
 * domains only) and as a Tauri desktop app (adds domains that need data outside
 * the browser sandbox: Defender for Endpoint REST, and Exchange/DLP via local
 * PowerShell).
 */

export interface Platform {
  /** True when running inside the Tauri desktop shell. */
  isDesktop: boolean;
  /**
   * A fetch that bypasses browser CORS (Tauri routes it through Rust). Present
   * only on desktop; used for no-CORS REST APIs (Defender for Endpoint).
   */
  nativeFetch?: typeof fetch;
  /**
   * Run a PowerShell script on the local machine and return its stdout. Present
   * only on desktop; used for Exchange Online / Security & Compliance modules.
   */
  runPowerShell?: (script: string) => Promise<string>;
}

/** True when the Tauri runtime is present. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Resolve the active platform. Tauri plugins are imported lazily so the browser
 * bundle never loads them.
 */
export async function getPlatform(): Promise<Platform> {
  if (!isTauri()) {
    return { isDesktop: false };
  }

  const [{ fetch: tauriFetch }, { invoke }] = await Promise.all([
    import("@tauri-apps/plugin-http"),
    import("@tauri-apps/api/core"),
  ]);

  return {
    isDesktop: true,
    nativeFetch: tauriFetch as unknown as typeof fetch,
    runPowerShell: (script: string) => invoke<string>("run_powershell", { script }),
  };
}
