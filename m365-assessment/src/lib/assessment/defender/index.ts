import { Finding, sortFindings } from "../../engine/types";
import { guarded } from "../../engine/runner";
import { GraphClient } from "../../graph/graphClient";
import { analyzeSecureScore } from "./secureScore";
import { analyzeImprovementActions, pickLatest } from "./improvementActions";
import { SecureScore, SecureScoreControlProfile } from "./graphTypes";

export interface DomainResult {
  findings: Finding[];
  errors: string[];
}

/**
 * Defender posture via Microsoft Secure Score (browser-reachable Graph). Covers
 * Defender for Office 365 (email/Teams), endpoint and identity controls.
 */
export async function runDefenderAssessment(graph: GraphClient): Promise<DomainResult> {
  const errors: string[] = [];

  const findings = await guarded(
    "secure-score",
    "defender",
    async () => {
      // Latest score + control profiles, fetched together.
      const [scores, profiles] = await Promise.all([
        graph.get<{ value: SecureScore[] }>("/security/secureScores", {
          query: "$top=5",
        }),
        graph.getAll<SecureScoreControlProfile>("/security/secureScoreControlProfiles"),
      ]);

      const latest = pickLatest(scores.value ?? []);
      const out: Finding[] = [analyzeSecureScore(latest)];
      if (latest?.controlScores?.length) {
        out.push(...analyzeImprovementActions(latest.controlScores, profiles));
      }
      return out;
    },
    errors,
  );

  return { findings: sortFindings(findings), errors };
}
