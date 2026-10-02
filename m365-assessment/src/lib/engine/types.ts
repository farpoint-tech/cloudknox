/**
 * Core assessment model. Every check produces one or more Findings; the UI
 * renders them grouped by domain and sorted by severity.
 */

export type Domain =
  | "iam"
  | "intune"
  | "defender"
  | "defenderEndpoint"
  | "exchange"
  | "dlp";

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/**
 * pass         – control is configured to best practice
 * fail         – control is missing/misconfigured (severity applies)
 * warning      – partially configured or a softer concern
 * manual       – cannot be determined via Graph; needs manual review
 * error        – the check could not run (e.g. missing permission / API error)
 * not-applicable – control does not apply to this tenant
 */
export type CheckStatus =
  | "pass"
  | "fail"
  | "warning"
  | "manual"
  | "error"
  | "not-applicable";

export interface Finding {
  /** Stable, unique slug, e.g. "iam.security-defaults". */
  id: string;
  domain: Domain;
  title: string;
  status: CheckStatus;
  /** Severity that applies when status is fail/warning; "info" otherwise. */
  severity: Severity;
  /** One-line result shown on the card. */
  summary: string;
  /** Optional longer explanation of what was found. */
  detail?: string;
  /** What the operator should do about it. */
  recommendation?: string;
  /** Small raw-data snippet backing the finding (kept client-side only). */
  evidence?: unknown;
  /** Link to Microsoft documentation for the control. */
  docsUrl?: string;
}

/** Context about a completed assessment run, shown in the report header. */
export interface AssessmentMetadata {
  /** ISO timestamp when the run completed. */
  generatedAt: string;
  tenantName?: string;
  tenantId?: string;
  /** Signed-in account (UPN) that ran the assessment. */
  account?: string;
}

export const DOMAIN_ORDER: Domain[] = [
  "iam",
  "intune",
  "defender",
  "defenderEndpoint",
  "exchange",
  "dlp",
];

export const DOMAIN_LABEL: Record<Domain, string> = {
  iam: "Identity & Access (IAM)",
  intune: "Intune — Device Compliance",
  defender: "Defender — Secure Score",
  defenderEndpoint: "Defender for Endpoint",
  exchange: "Exchange Online — Anti-Phishing",
  dlp: "Purview — Data Loss Prevention",
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Sort findings: failures first, then by severity, then by title. */
export function sortFindings(findings: Finding[]): Finding[] {
  const statusRank: Record<CheckStatus, number> = {
    fail: 0,
    warning: 1,
    manual: 2,
    error: 3,
    pass: 4,
    "not-applicable": 5,
  };
  return [...findings].sort((a, b) => {
    if (statusRank[a.status] !== statusRank[b.status]) {
      return statusRank[a.status] - statusRank[b.status];
    }
    if (SEVERITY_ORDER[a.severity] !== SEVERITY_ORDER[b.severity]) {
      return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    }
    return a.title.localeCompare(b.title);
  });
}
