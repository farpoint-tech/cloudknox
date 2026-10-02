import { GraphClient } from "../graph/graphClient";
import { Platform } from "../platform/runtime";

/**
 * Everything a domain runner may need. Graph domains use `graph`; desktop-only
 * domains additionally need `platform` (native fetch / local PowerShell) and,
 * for Defender for Endpoint, a token for that separate API resource.
 */
export interface AssessmentContext {
  graph: GraphClient;
  platform: Platform;
  /** Token getter for the Defender for Endpoint API (desktop only). */
  getDefenderEndpointToken?: () => Promise<string>;
}
