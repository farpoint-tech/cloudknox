import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { DOCS } from "./entraRoles";
import { ConditionalAccessPolicy, SecurityDefaultsPolicy } from "./graphTypes";

const ID = "iam.security-defaults";

export function analyzeSecurityDefaults(
  sd: SecurityDefaultsPolicy,
  caPolicies: ConditionalAccessPolicy[],
): Finding {
  if (sd.isEnabled) {
    return {
      id: ID,
      domain: "iam",
      title: "Security Defaults",
      status: "pass",
      severity: "info",
      summary: "Security Defaults are ENABLED — baseline MFA is enforced for all users.",
      detail:
        "Security Defaults enforce MFA registration and challenge for all users and " +
        "block legacy authentication. This is a solid baseline for small tenants.",
      recommendation:
        "For anything beyond a small tenant, move to Conditional Access for granular " +
        "control (Security Defaults and Conditional Access are mutually exclusive).",
      docsUrl: DOCS.securityDefaults,
    };
  }

  const enabledCa = caPolicies.filter((p) => p.state === "enabled");
  if (enabledCa.length === 0) {
    return {
      id: ID,
      domain: "iam",
      title: "Security Defaults",
      status: "fail",
      severity: "critical",
      summary:
        "Security Defaults are DISABLED and NO enabled Conditional Access policy exists.",
      detail:
        "The tenant has neither Security Defaults nor any active Conditional Access " +
        "policy, so there is no baseline enforcement of MFA. Accounts can sign in with " +
        "password only.",
      recommendation:
        "Enable Security Defaults, or (P1/P2) create Conditional Access policies that " +
        "require MFA for all users and block legacy authentication.",
      docsUrl: DOCS.securityDefaults,
    };
  }

  return {
    id: ID,
    domain: "iam",
    title: "Security Defaults",
    status: "pass",
    severity: "info",
    summary:
      `Security Defaults are disabled, but ${enabledCa.length} Conditional Access ` +
      "policy(ies) are active — expected for P1/P2 tenants.",
    detail:
      "Disabling Security Defaults is normal when Conditional Access is used instead. " +
      "The Conditional Access checks below assess whether the baseline is actually covered.",
    docsUrl: DOCS.conditionalAccess,
  };
}

export async function runSecurityDefaults(
  graph: GraphClient,
  caPolicies: ConditionalAccessPolicy[],
): Promise<Finding> {
  const sd = await graph.get<SecurityDefaultsPolicy>(
    "/policies/identitySecurityDefaultsEnforcementPolicy",
  );
  return analyzeSecurityDefaults(sd, caPolicies);
}
