import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { DOCS, ManagedDevice } from "./graphTypes";

/** Summarise managed-device compliance state into a coverage finding. */
export function analyzeDeviceCompliance(devices: ManagedDevice[]): Finding[] {
  const total = devices.length;
  if (total === 0) {
    return [
      {
        id: "intune.devices.compliance",
        domain: "intune",
        title: "Managed device compliance",
        status: "not-applicable",
        severity: "info",
        summary: "No managed devices were found.",
        docsUrl: DOCS.complianceOverview,
      },
    ];
  }

  const compliant = devices.filter((d) => d.complianceState === "compliant").length;
  const grace = devices.filter((d) => d.complianceState === "inGracePeriod").length;
  const noncompliant = devices.filter(
    (d) => d.complianceState === "noncompliant" || d.complianceState === "error" || d.complianceState === "conflict",
  ).length;
  const percent = Math.round((compliant / total) * 100);

  const status = percent >= 95 ? "pass" : percent >= 80 ? "warning" : "fail";
  const severity = percent >= 95 ? "info" : percent >= 80 ? "medium" : "high";

  return [
    {
      id: "intune.devices.compliance",
      domain: "intune",
      title: "Managed device compliance",
      status,
      severity,
      summary: `${compliant}/${total} devices (${percent}%) compliant · ${noncompliant} noncompliant · ${grace} in grace period.`,
      recommendation:
        status === "pass"
          ? undefined
          : "Investigate noncompliant devices and ensure every device is targeted by a compliance policy.",
      detail: "Compliance state is read across all enrolled managed devices.",
      docsUrl: DOCS.complianceOverview,
    },
  ];
}

export async function runDeviceCompliance(graph: GraphClient): Promise<Finding[]> {
  const devices = await graph.getAll<ManagedDevice>("/deviceManagement/managedDevices", {
    query: "$select=id,complianceState,operatingSystem",
  });
  return analyzeDeviceCompliance(devices);
}
