import { Finding } from "../../engine/types";
import { DOCS, SecureScore } from "./graphTypes";

/** Overall Microsoft Secure Score, with comparison to the all-tenants average. */
export function analyzeSecureScore(score: SecureScore | undefined): Finding {
  if (!score || typeof score.currentScore !== "number" || !score.maxScore) {
    return {
      id: "defender.securescore.overall",
      domain: "defender",
      title: "Microsoft Secure Score",
      status: "manual",
      severity: "info",
      summary: "Secure Score could not be read for this tenant.",
      docsUrl: DOCS.secureScore,
    };
  }

  const pct = Math.round((score.currentScore / score.maxScore) * 100);
  const avg = (score.averageComparativeScores ?? []).find((a) => a.basis === "AllTenants");
  const avgPct =
    avg && typeof avg.averageScore === "number"
      ? Math.round((avg.averageScore / score.maxScore) * 100)
      : undefined;

  let status: Finding["status"] = "warning";
  let severity: Finding["severity"] = "medium";
  if (avgPct !== undefined) {
    if (pct >= avgPct) {
      status = "pass";
      severity = "info";
    } else if (avgPct - pct <= 10) {
      status = "warning";
      severity = "medium";
    } else {
      status = "fail";
      severity = "high";
    }
  } else {
    status = pct >= 60 ? "pass" : pct >= 40 ? "warning" : "fail";
    severity = pct >= 60 ? "info" : pct >= 40 ? "medium" : "high";
  }

  const comparison =
    avgPct !== undefined ? ` (all-tenants average: ${avgPct}%)` : "";

  return {
    id: "defender.securescore.overall",
    domain: "defender",
    title: "Microsoft Secure Score",
    status,
    severity,
    summary: `Secure Score is ${score.currentScore}/${score.maxScore} (${pct}%)${comparison}.`,
    detail:
      "Microsoft Secure Score aggregates identity, device, app and Defender for " +
      "Office 365 controls. The improvement actions below list the biggest gaps.",
    recommendation:
      status === "pass" ? undefined : "Work through the highest-impact improvement actions below.",
    evidence: { createdDateTime: score.createdDateTime, enabledServices: score.enabledServices },
    docsUrl: DOCS.secureScore,
  };
}
