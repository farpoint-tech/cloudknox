import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { DeviceManagementSettings, DOCS } from "./graphTypes";

/**
 * Tenant-wide compliance settings: the "mark devices with no compliance policy
 * as not compliant" secure default, and the compliance status validity period.
 */
export function analyzeComplianceSettings(
  settings: DeviceManagementSettings | undefined,
): Finding[] {
  const findings: Finding[] = [];

  if (!settings) {
    findings.push({
      id: "intune.settings.secure-by-default",
      domain: "intune",
      title: "Devices with no compliance policy",
      status: "manual",
      severity: "info",
      summary: "Tenant compliance settings could not be read.",
      recommendation: "Review Endpoint security → Device compliance → Compliance policy settings manually.",
      docsUrl: DOCS.complianceOverview,
    });
    return findings;
  }

  // 1) secureByDefault — the key baseline for CA compliance-based access.
  findings.push(
    settings.secureByDefault === true
      ? mk("intune.settings.secure-by-default", "Devices with no compliance policy", "pass", "info",
          "Devices without an assigned compliance policy are treated as NOT compliant (secure default on).")
      : mk("intune.settings.secure-by-default", "Devices with no compliance policy", "fail", "high",
          "Devices without a compliance policy are treated as COMPLIANT (secure default off).",
          "Set 'Mark devices with no compliance policy assigned as' to Not compliant, so Conditional Access can only admit confirmed-compliant devices."),
  );

  // 2) Compliance status validity period.
  const days = settings.deviceComplianceCheckinThresholdDays;
  if (typeof days === "number") {
    const status = days <= 30 ? "pass" : days <= 60 ? "warning" : "fail";
    const severity = days <= 30 ? "info" : days <= 60 ? "medium" : "high";
    findings.push(mk("intune.settings.validity-period", "Compliance status validity period", status, severity,
      `Validity period is ${days} day(s).`,
      status === "pass" ? undefined
        : "Lower the validity period (default 30 days) so devices that stop reporting are marked noncompliant sooner."));
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
  return { id, domain: "intune", title, status, severity, summary, recommendation, docsUrl: DOCS.complianceOverview };
}

export async function runComplianceSettings(graph: GraphClient): Promise<Finding[]> {
  const dm = await graph.get<{ settings?: DeviceManagementSettings }>(
    "/deviceManagement",
    { query: "$select=settings" },
  );
  return analyzeComplianceSettings(dm.settings);
}
