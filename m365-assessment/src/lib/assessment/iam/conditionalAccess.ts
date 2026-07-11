import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { AUTH_STRENGTH, DOCS, PRIVILEGED_ROLE_IDS } from "./entraRoles";
import { ConditionalAccessPolicy } from "./graphTypes";

// ---- policy predicates -----------------------------------------------------

const isEnabled = (p: ConditionalAccessPolicy) => p.state === "enabled";
const isReportOnly = (p: ConditionalAccessPolicy) =>
  p.state === "enabledForReportingButNotEnforced";

const requiresMfa = (p: ConditionalAccessPolicy) =>
  (p.grantControls?.builtInControls ?? []).includes("mfa") ||
  Boolean(p.grantControls?.authenticationStrength?.id);

const isBlock = (p: ConditionalAccessPolicy) =>
  (p.grantControls?.builtInControls ?? []).includes("block");

const strengthId = (p: ConditionalAccessPolicy) =>
  p.grantControls?.authenticationStrength?.id;

const targetsAllUsers = (p: ConditionalAccessPolicy) =>
  (p.conditions?.users?.includeUsers ?? []).includes("All");

const targetsAdmins = (p: ConditionalAccessPolicy) =>
  (p.conditions?.users?.includeRoles ?? []).some((r) => PRIVILEGED_ROLE_IDS.has(r));

const targetsAllApps = (p: ConditionalAccessPolicy) =>
  (p.conditions?.applications?.includeApplications ?? []).includes("All");

const coversLegacyAuth = (p: ConditionalAccessPolicy) => {
  const t = p.conditions?.clientAppTypes ?? [];
  return t.includes("all") || t.includes("exchangeActiveSync") || t.includes("other");
};

const names = (ps: ConditionalAccessPolicy[]) =>
  ps.map((p) => p.displayName ?? p.id ?? "(unnamed)");

/**
 * Detect the baseline Conditional Access posture: MFA for all users, MFA for
 * admins, phishing-resistant MFA for admins, and a legacy-auth block.
 * Report-only matches are surfaced as warnings (configured but not enforced).
 */
export function analyzeConditionalAccess(
  policies: ConditionalAccessPolicy[],
): Finding[] {
  const findings: Finding[] = [];

  // 1) MFA for ALL users on ALL apps
  {
    const enforced = policies.filter(
      (p) => isEnabled(p) && targetsAllUsers(p) && targetsAllApps(p) && requiresMfa(p),
    );
    const reportOnly = policies.filter(
      (p) => isReportOnly(p) && targetsAllUsers(p) && targetsAllApps(p) && requiresMfa(p),
    );
    findings.push(
      enforced.length > 0
        ? finding("iam.ca.mfa-all-users", "CA: MFA for all users", "pass", "info",
            `Enforced by: ${names(enforced).join(", ")}.`)
        : reportOnly.length > 0
          ? finding("iam.ca.mfa-all-users", "CA: MFA for all users", "warning", "high",
              `A matching policy exists but is REPORT-ONLY (not enforced): ${names(reportOnly).join(", ")}.`,
              "Switch the report-only policy to enabled after validating impact.")
          : finding("iam.ca.mfa-all-users", "CA: MFA for all users", "fail", "high",
              "No enabled policy requires MFA for all users on all apps.",
              "Create a Conditional Access policy requiring MFA (or an MFA strength) for All users / All cloud apps."),
    );
  }

  // 2) MFA for admin roles
  {
    const enforced = policies.filter(
      (p) => isEnabled(p) && targetsAdmins(p) && requiresMfa(p),
    );
    findings.push(
      enforced.length > 0
        ? finding("iam.ca.mfa-admins", "CA: MFA for admins", "pass", "info",
            `Enforced by: ${names(enforced).join(", ")}.`)
        : finding("iam.ca.mfa-admins", "CA: MFA for admins", "fail", "critical",
            "No enabled policy requires MFA specifically for privileged directory roles.",
            "Create a Conditional Access policy targeting admin roles that requires MFA — ideally a phishing-resistant strength.",
            DOCS.mfaAdmins),
    );
  }

  // 3) Phishing-resistant MFA for admins
  {
    const phish = policies.filter(
      (p) => isEnabled(p) && targetsAdmins(p) &&
        strengthId(p) === AUTH_STRENGTH.phishingResistant,
    );
    findings.push(
      phish.length > 0
        ? finding("iam.ca.phishing-resistant-admins", "CA: Phishing-resistant MFA for admins", "pass", "info",
            `Enforced by: ${names(phish).join(", ")}.`)
        : finding("iam.ca.phishing-resistant-admins", "CA: Phishing-resistant MFA for admins", "fail", "high",
            "Admins are not required to use a phishing-resistant authentication strength.",
            "Require the built-in 'Phishing-resistant MFA' strength (FIDO2, Windows Hello for Business, or certificate) for privileged roles.",
            DOCS.phishingResistant),
    );
  }

  // 4) Legacy authentication block
  {
    const block = policies.filter(
      (p) => isEnabled(p) && isBlock(p) && coversLegacyAuth(p),
    );
    findings.push(
      block.length > 0
        ? finding("iam.ca.block-legacy-auth", "CA: Block legacy authentication", "pass", "info",
            `Blocked by: ${names(block).join(", ")}.`)
        : finding("iam.ca.block-legacy-auth", "CA: Block legacy authentication", "fail", "high",
            "No enabled policy blocks legacy authentication protocols.",
            "Create a Conditional Access policy that blocks legacy auth client app types (Exchange ActiveSync / other clients)."),
    );
  }

  return findings;
}

function finding(
  id: string,
  title: string,
  status: Finding["status"],
  severity: Finding["severity"],
  summary: string,
  recommendation?: string,
  docsUrl: string = DOCS.conditionalAccess,
): Finding {
  return { id, domain: "iam", title, status, severity, summary, recommendation, docsUrl };
}

export async function runConditionalAccess(
  policies: ConditionalAccessPolicy[],
): Promise<Finding[]> {
  return analyzeConditionalAccess(policies);
}

/** Fetch all CA policies once; shared by several checks. */
export async function fetchConditionalAccessPolicies(
  graph: GraphClient,
): Promise<ConditionalAccessPolicy[]> {
  return graph.getAll<ConditionalAccessPolicy>("/identity/conditionalAccess/policies");
}
