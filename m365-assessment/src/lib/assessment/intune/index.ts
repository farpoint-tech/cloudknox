import { Finding, sortFindings } from "../../engine/types";
import { guarded } from "../../engine/runner";
import { GraphClient } from "../../graph/graphClient";
import { runComplianceSettings } from "./complianceSettings";
import { runCompliancePolicies } from "./compliancePolicies";
import { runDeviceCompliance } from "./deviceCompliance";

export interface DomainResult {
  findings: Finding[];
  errors: string[];
}

/** Run the Intune compliance assessment; each check is isolated. */
export async function runIntuneAssessment(graph: GraphClient): Promise<DomainResult> {
  const errors: string[] = [];

  const groups = await Promise.all([
    guarded("compliance-settings", "intune", () => runComplianceSettings(graph), errors),
    guarded("compliance-policies", "intune", () => runCompliancePolicies(graph), errors),
    guarded("device-compliance", "intune", () => runDeviceCompliance(graph), errors),
  ]);

  const findings = groups.flat();
  return { findings: sortFindings(findings), errors };
}
