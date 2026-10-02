import { Finding } from "../../engine/types";
import {
  ControlScore,
  DOCS,
  SecureScore,
  SecureScoreControlProfile,
  toNumber,
} from "./graphTypes";

const MAX_ACTIONS = 8;

/**
 * Derive the highest-impact Secure Score improvement actions by joining the
 * tenant's per-control scores with the control profiles (for titles, max score
 * and remediation text). Returns up to MAX_ACTIONS findings, largest gap first.
 */
export function analyzeImprovementActions(
  controlScores: ControlScore[],
  profiles: SecureScoreControlProfile[],
): Finding[] {
  const profileById = new Map<string, SecureScoreControlProfile>();
  for (const p of profiles) {
    if (p.id && !p.deprecated) profileById.set(p.id.toLowerCase(), p);
  }

  const gaps = controlScores
    .map((cs) => {
      const profile = cs.controlName
        ? profileById.get(cs.controlName.toLowerCase())
        : undefined;
      const max = toNumber(profile?.maxScore);
      const score = typeof cs.score === "number" ? cs.score : 0;
      return { cs, profile, max, score, gap: max - score };
    })
    .filter((g) => g.max > 0 && g.gap > 0.01)
    .sort((a, b) => b.gap - a.gap);

  const top = gaps.slice(0, MAX_ACTIONS);

  const findings: Finding[] = top.map((g) => {
    const title = g.profile?.title ?? g.cs.controlName ?? "Secure Score control";
    const category = g.cs.controlCategory ?? g.profile?.controlCategory ?? "General";
    const notImplemented = g.score <= 0.01;
    return {
      id: `defender.action.${(g.cs.controlName ?? title).toLowerCase()}`,
      domain: "defender",
      title: `Secure Score: ${title}`,
      status: notImplemented ? "fail" : "warning",
      severity: notImplemented ? "high" : "medium",
      summary: `${category} · scoring ${g.score.toFixed(1)}/${g.max.toFixed(1)} points.`,
      detail: g.profile?.remediation ?? g.cs.description,
      recommendation: g.profile?.remediationImpact
        ? `Impact: ${g.profile.remediationImpact}`
        : undefined,
      docsUrl: g.profile?.actionUrl || DOCS.secureScore,
    };
  });

  if (gaps.length > top.length) {
    findings.push({
      id: "defender.action.more",
      domain: "defender",
      title: `${gaps.length - top.length} more Secure Score improvement actions`,
      status: "manual",
      severity: "info",
      summary: `Showing the top ${top.length} of ${gaps.length} open improvement actions.`,
      recommendation: "Review the full list in the Microsoft Defender portal → Secure Score.",
      docsUrl: DOCS.secureScore,
    });
  }

  return findings;
}

export function pickLatest(scores: SecureScore[]): SecureScore | undefined {
  if (scores.length === 0) return undefined;
  return [...scores].sort((a, b) =>
    (b.createdDateTime ?? "").localeCompare(a.createdDateTime ?? ""),
  )[0];
}
