import { Finding } from "../../engine/types";

export interface AntiPhishPolicy {
  Name?: string;
  IsDefault?: boolean;
  Enabled?: boolean;
  EnableSpoofIntelligence?: boolean;
  EnableMailboxIntelligence?: boolean;
  EnableMailboxIntelligenceProtection?: boolean;
  PhishThresholdLevel?: number;
  EnableTargetedUserProtection?: boolean;
  EnableTargetedDomainsProtection?: boolean;
  EnableOrganizationDomainsProtection?: boolean;
  HonorDmarcPolicy?: boolean;
}

const DOCS =
  "https://learn.microsoft.com/defender-office-365/anti-phishing-policies-about";

/** Assess the effective (default) anti-phishing policy against EOP best practice. */
export function analyzeAntiPhish(policies: AntiPhishPolicy[]): Finding[] {
  if (policies.length === 0) {
    return [
      mk("exchange.antiphish.exists", "Anti-phishing policy", "fail", "high",
        "No anti-phishing policy was returned.",
        "Ensure Exchange Online Protection anti-phishing is configured."),
    ];
  }

  const effective = policies.find((p) => p.IsDefault) ?? policies[0];
  const findings: Finding[] = [];

  findings.push(
    effective.EnableSpoofIntelligence
      ? mk("exchange.antiphish.spoof-intelligence", "Spoof intelligence", "pass", "info",
          "Spoof intelligence is enabled on the default anti-phishing policy.")
      : mk("exchange.antiphish.spoof-intelligence", "Spoof intelligence", "fail", "high",
          "Spoof intelligence is disabled on the default anti-phishing policy.",
          "Enable spoof intelligence so spoofed senders are detected and actioned."),
  );

  const mbi = effective.EnableMailboxIntelligence && effective.EnableMailboxIntelligenceProtection;
  findings.push(
    mbi
      ? mk("exchange.antiphish.mailbox-intelligence", "Mailbox intelligence protection", "pass", "info",
          "Mailbox intelligence impersonation protection is enabled.")
      : mk("exchange.antiphish.mailbox-intelligence", "Mailbox intelligence protection", "warning", "medium",
          "Mailbox intelligence impersonation protection is not fully enabled.",
          "Enable mailbox intelligence and its protection action for impersonation defence."),
  );

  const level = effective.PhishThresholdLevel ?? 1;
  findings.push(
    level >= 2
      ? mk("exchange.antiphish.threshold", "Phishing threshold", "pass", "info",
          `Phishing threshold level is ${level} (aggressive).`)
      : mk("exchange.antiphish.threshold", "Phishing threshold", "warning", "medium",
          `Phishing threshold level is ${level} (standard).`,
          "Consider raising the phishing threshold to level 2+ for stronger detection."),
  );

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
  return { id, domain: "exchange", title, status, severity, summary, recommendation, docsUrl: DOCS };
}
