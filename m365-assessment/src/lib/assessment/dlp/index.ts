import { Finding, sortFindings } from "../../engine/types";
import { guarded } from "../../engine/runner";
import { AssessmentContext } from "../context";
import { desktopOnlyFinding, parsePowerShellJson } from "../desktop";
import { analyzeDlp, DlpCompliancePolicy } from "./policies";

export interface DomainResult {
  findings: Finding[];
  errors: string[];
}

// Security & Compliance PowerShell (Connect-IPPSSession) handles its own
// interactive sign-in. Only the read cmdlet Get-DlpCompliancePolicy is used.
// $WarningPreference/$ProgressPreference keep connect noise off the streams so
// only the ConvertTo-Json payload reaches stdout for parsing.
const SCRIPT = [
  "$WarningPreference='SilentlyContinue'",
  "$ProgressPreference='SilentlyContinue'",
  "Connect-IPPSSession -WarningAction SilentlyContinue | Out-Null",
  "Get-DlpCompliancePolicy | Select-Object Name,Mode,Enabled,Workload | ConvertTo-Json -Depth 3",
].join("; ");

/**
 * Purview DLP posture. Needs Security & Compliance PowerShell (no REST/CORS), so
 * it runs only in the desktop build via the local ExchangeOnlineManagement module.
 */
export async function runDlpAssessment(ctx: AssessmentContext): Promise<DomainResult> {
  if (!ctx.platform.isDesktop || !ctx.platform.runPowerShell) {
    return {
      findings: [
        desktopOnlyFinding(
          "dlp",
          "Purview — Data Loss Prevention",
          "Needs Security & Compliance PowerShell (no REST API)",
        ),
      ],
      errors: [],
    };
  }

  const errors: string[] = [];
  const findings = await guarded(
    "dlp-policies",
    "dlp",
    async () => {
      const stdout = await ctx.platform.runPowerShell!(SCRIPT);
      const policies = parsePowerShellJson<DlpCompliancePolicy>(stdout);
      return analyzeDlp(policies);
    },
    errors,
  );

  return { findings: sortFindings(findings), errors };
}
