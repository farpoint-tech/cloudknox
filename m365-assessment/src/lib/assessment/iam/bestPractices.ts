import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { DOCS } from "./entraRoles";
import { AuthorizationPolicy } from "./graphTypes";

/**
 * Best-practice Entra ID tenant settings derived from the authorization policy:
 * user app-registration, guest-invite scope, and other-user readability.
 */
export function analyzeBestPractices(policy: AuthorizationPolicy): Finding[] {
  const findings: Finding[] = [];
  const perms = policy.defaultUserRolePermissions ?? {};

  // 1) Non-admins should not be able to register applications.
  findings.push(
    perms.allowedToCreateApps === false
      ? mk("iam.bp.user-app-registration", "User app registration", "pass", "info",
          "Standard users cannot register applications.")
      : mk("iam.bp.user-app-registration", "User app registration", "fail", "medium",
          "Standard users CAN register applications, expanding the app-consent attack surface.",
          "Set 'Users can register applications' to No; delegate app registration to a specific role."),
  );

  // 2) Guest invitations should be restricted.
  {
    const scope = policy.allowInvitesFrom ?? "unknown";
    const restricted = scope === "adminsAndGuestInviters" || scope === "none";
    findings.push(
      restricted
        ? mk("iam.bp.guest-invites", "Guest invitation restrictions", "pass", "info",
            `Guest invitations are restricted (allowInvitesFrom = ${scope}).`)
        : mk("iam.bp.guest-invites", "Guest invitation restrictions", "warning", "medium",
            `Guest invitations are broadly allowed (allowInvitesFrom = ${scope}).`,
            "Restrict who can invite guests to admins and designated inviters."),
    );
  }

  // 3) Restrict other-user readability for members (defense in depth).
  if (perms.allowedToReadOtherUsers === false) {
    findings.push(mk("iam.bp.read-other-users", "Restrict directory enumeration", "pass", "info",
      "Members cannot read other users' profiles broadly."));
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
): Finding {
  return {
    id, domain: "iam", title, status, severity, summary, recommendation,
    docsUrl: DOCS.authorizationPolicy,
  };
}

export async function runBestPractices(graph: GraphClient): Promise<Finding[]> {
  const policy = await graph.get<AuthorizationPolicy>("/policies/authorizationPolicy");
  return analyzeBestPractices(policy);
}
