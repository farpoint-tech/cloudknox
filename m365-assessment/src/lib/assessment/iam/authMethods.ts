import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { DOCS } from "./entraRoles";
import { UserRegistrationDetail } from "./graphTypes";

const pct = (n: number, total: number) =>
  total === 0 ? 0 : Math.round((n / total) * 100);

/**
 * Analyse the authentication-methods registration report. One report answers:
 * MFA capability per user, registered methods, admin MFA, SSPR for admins, and
 * passwordless/phishing-resistant capability.
 */
export function analyzeAuthMethods(details: UserRegistrationDetail[]): Finding[] {
  const findings: Finding[] = [];
  const total = details.length;
  const admins = details.filter((d) => d.isAdmin === true);

  // 1) Admins without MFA capability — the highest-value target.
  {
    const adminsNoMfa = admins.filter((d) => d.isMfaCapable !== true);
    if (admins.length === 0) {
      findings.push(mk("iam.authmethods.admin-mfa", "Admin MFA registration", "manual", "info",
        "No admin accounts were flagged in the registration report.",
        "Verify privileged role membership separately."));
    } else if (adminsNoMfa.length > 0) {
      findings.push(mk("iam.authmethods.admin-mfa", "Admin MFA registration", "fail", "critical",
        `${adminsNoMfa.length} of ${admins.length} admin(s) are NOT MFA-capable.`,
        "Ensure every privileged account has registered strong MFA immediately.",
        adminsNoMfa.slice(0, 25).map((a) => a.userPrincipalName)));
    } else {
      findings.push(mk("iam.authmethods.admin-mfa", "Admin MFA registration", "pass", "info",
        `All ${admins.length} admin(s) are MFA-capable.`));
    }
  }

  // 2) Overall MFA coverage across all users.
  {
    const capable = details.filter((d) => d.isMfaCapable === true).length;
    const coverage = pct(capable, total);
    const status = coverage >= 97 ? "pass" : coverage >= 80 ? "warning" : "fail";
    const severity = coverage >= 97 ? "info" : coverage >= 80 ? "medium" : "high";
    findings.push(mk("iam.authmethods.mfa-coverage", "MFA registration coverage", status, severity,
      `${capable}/${total} users (${coverage}%) are MFA-capable.`,
      status === "pass" ? undefined
        : "Drive registration for the remaining users; combine with a registration-campaign or CA policy.",
      undefined, DOCS.authMethods));
  }

  // 3) SSPR enabled for admins.
  {
    const adminsSsprOff = admins.filter((d) => d.isSsprEnabled === false);
    if (admins.length === 0) {
      findings.push(mk("iam.authmethods.admin-sspr", "SSPR for admins", "manual", "info",
        "No admin accounts were flagged in the registration report."));
    } else if (adminsSsprOff.length > 0) {
      findings.push(mk("iam.authmethods.admin-sspr", "SSPR for admins", "warning", "medium",
        `SSPR is NOT enabled for ${adminsSsprOff.length} of ${admins.length} admin(s).`,
        "Enable self-service password reset for administrators so they can recover access with strong verification.",
        adminsSsprOff.slice(0, 25).map((a) => a.userPrincipalName), DOCS.sspr));
    } else {
      findings.push(mk("iam.authmethods.admin-sspr", "SSPR for admins", "pass", "info",
        `SSPR is enabled for all ${admins.length} admin(s).`, undefined, undefined, DOCS.sspr));
    }
  }

  // 4) Phishing-resistant / passwordless capability among admins.
  {
    const capable = admins.filter((d) => d.isPasswordlessCapable === true).length;
    if (admins.length > 0) {
      const status = capable === admins.length ? "pass" : capable > 0 ? "warning" : "fail";
      const severity = capable === admins.length ? "info" : "high";
      findings.push(mk("iam.authmethods.admin-passwordless", "Admin passwordless capability", status, severity,
        `${capable}/${admins.length} admin(s) are passwordless/phishing-resistant capable.`,
        status === "pass" ? undefined
          : "Roll out FIDO2 keys or Windows Hello for Business to privileged accounts.",
        undefined, DOCS.phishingResistant));
    }
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
  docsUrl: string = DOCS.authMethods,
): Finding {
  return { id, domain: "iam", title, status, severity, summary, recommendation, evidence, docsUrl };
}

export async function runAuthMethods(graph: GraphClient): Promise<Finding[]> {
  const details = await graph.getAll<UserRegistrationDetail>(
    "/reports/authenticationMethods/userRegistrationDetails",
  );
  return analyzeAuthMethods(details);
}
