import { Finding, sortFindings } from "../../engine/types";
import { guarded } from "../../engine/runner";
import { AssessmentContext } from "../context";
import { desktopOnlyFinding, parsePowerShellJson } from "../desktop";
import { analyzeAntiPhish, AntiPhishPolicy } from "./antiPhish";

export interface DomainResult {
  findings: Finding[];
  errors: string[];
}

// Runs in the admin's local PowerShell; the ExchangeOnlineManagement module
// handles its own interactive sign-in. Only read cmdlets are used.
const SCRIPT = [
  "Connect-ExchangeOnline -ShowBanner:$false | Out-Null",
  "Get-AntiPhishPolicy | Select-Object Name,IsDefault,Enabled,EnableSpoofIntelligence,EnableMailboxIntelligence,EnableMailboxIntelligenceProtection,PhishThresholdLevel,EnableTargetedUserProtection,EnableTargetedDomainsProtection,EnableOrganizationDomainsProtection,HonorDmarcPolicy | ConvertTo-Json -Depth 3",
].join("; ");

/**
 * Exchange Online anti-phishing posture. Needs Security & Compliance / EXO
 * PowerShell (no REST/CORS), so it runs only in the desktop build via the local
 * ExchangeOnlineManagement module.
 */
export async function runExchangeAssessment(ctx: AssessmentContext): Promise<DomainResult> {
  if (!ctx.platform.isDesktop || !ctx.platform.runPowerShell) {
    return {
      findings: [
        desktopOnlyFinding(
          "exchange",
          "Exchange Online — Anti-Phishing",
          "Needs Exchange Online PowerShell (no REST API)",
        ),
      ],
      errors: [],
    };
  }

  const errors: string[] = [];
  const findings = await guarded(
    "exchange-antiphish",
    "exchange",
    async () => {
      const stdout = await ctx.platform.runPowerShell!(SCRIPT);
      const policies = parsePowerShellJson<AntiPhishPolicy>(stdout);
      return analyzeAntiPhish(policies);
    },
    errors,
  );

  return { findings: sortFindings(findings), errors };
}
