import { Finding, sortFindings } from "../../engine/types";
import { guarded } from "../../engine/runner";
import { GraphClient } from "../../graph/graphClient";
import { AssessmentContext } from "../context";
import { desktopOnlyFinding } from "../desktop";
import { analyzeMachines, Machine } from "./machines";

export interface DomainResult {
  findings: Finding[];
  errors: string[];
}

/**
 * Defender for Endpoint device posture. Uses the DfE REST API
 * (api.security.microsoft.com), which has no CORS and a separate token
 * resource — so it runs only in the desktop build.
 */
export async function runDefenderEndpointAssessment(
  ctx: AssessmentContext,
): Promise<DomainResult> {
  if (!ctx.platform.isDesktop || !ctx.platform.nativeFetch || !ctx.getDefenderEndpointToken) {
    return {
      findings: [
        desktopOnlyFinding(
          "defenderEndpoint",
          "Defender for Endpoint",
          "Reaches the Defender for Endpoint API (no browser CORS)",
        ),
      ],
      errors: [],
    };
  }

  const errors: string[] = [];
  const findings = await guarded(
    "defender-endpoint",
    "defenderEndpoint",
    async () => {
      const client = new GraphClient({
        getToken: ctx.getDefenderEndpointToken!,
        baseUrl: "https://api.security.microsoft.com",
        pathPrefix: "/api",
        fetchFn: ctx.platform.nativeFetch,
      });
      const machines = await client.getAll<Machine>("/machines", {
        query: "$select=id,computerDnsName,osPlatform,healthStatus,onboardingStatus,riskScore,exposureLevel,lastSeen",
      });
      return analyzeMachines(machines);
    },
    errors,
  );

  return { findings: sortFindings(findings), errors };
}
