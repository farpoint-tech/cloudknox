import { Finding } from "../../engine/types";

export interface DlpCompliancePolicy {
  Name?: string;
  /** Enable | TestWithNotifications | TestWithoutNotifications | Disable */
  Mode?: string;
  Enabled?: boolean;
  Workload?: string;
}

const DOCS = "https://learn.microsoft.com/purview/dlp-learn-about-dlp";

const isEnforced = (p: DlpCompliancePolicy) => p.Mode === "Enable";
const isTest = (p: DlpCompliancePolicy) =>
  p.Mode === "TestWithNotifications" || p.Mode === "TestWithoutNotifications";

/** Assess whether Purview DLP policies exist and are enforced. */
export function analyzeDlp(policies: DlpCompliancePolicy[]): Finding[] {
  if (policies.length === 0) {
    return [
      mk("dlp.exists", "DLP policies", "fail", "high",
        "No Purview data loss prevention policies are defined.",
        "Create at least one DLP policy (e.g. for financial / PII data across Exchange, SharePoint, OneDrive and Teams)."),
    ];
  }

  const enforced = policies.filter(isEnforced);
  const test = policies.filter(isTest);
  const findings: Finding[] = [];

  if (enforced.length > 0) {
    findings.push(mk("dlp.enforced", "DLP enforcement", "pass", "info",
      `${enforced.length} DLP policy(ies) enforced (of ${policies.length} total).`,
      undefined,
      enforced.slice(0, 25).map((p) => `${p.Name ?? "(unnamed)"} [${p.Workload ?? "?"}]`)));
  } else if (test.length > 0) {
    findings.push(mk("dlp.enforced", "DLP enforcement", "warning", "medium",
      `${test.length} DLP policy(ies) exist but are in TEST mode only (not enforced).`,
      "Move validated DLP policies from test mode to Enable so they actively protect data.",
      test.slice(0, 25).map((p) => p.Name ?? "(unnamed)")));
  } else {
    findings.push(mk("dlp.enforced", "DLP enforcement", "fail", "high",
      `${policies.length} DLP policy(ies) exist but none are enabled or in test mode.`,
      "Enable the DLP policies so they take effect."));
  }

  return findings;
}

function mk(
  id: string,
  title: string,
  status: Finding["status"],
  severity: Finding["severity"],
  summary: string,
  recommendation?: string,
  evidence?: unknown,
): Finding {
  return { id, domain: "dlp", title, status, severity, summary, recommendation, evidence, docsUrl: DOCS };
}
