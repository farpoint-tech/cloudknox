import { Finding } from "../../engine/types";
import { GraphClient } from "../../graph/graphClient";
import { CompliancePolicy, DOCS, platformFromODataType } from "./graphTypes";

/** Whether at least one compliance policy exists, and which platforms it covers. */
export function analyzeCompliancePolicies(policies: CompliancePolicy[]): Finding[] {
  if (policies.length === 0) {
    return [
      {
        id: "intune.policies.exist",
        domain: "intune",
        title: "Compliance policies",
        status: "fail",
        severity: "high",
        summary: "No device compliance policies are defined.",
        recommendation:
          "Create at least one compliance policy per managed platform so device health can gate access.",
        docsUrl: DOCS.createPolicy,
      },
    ];
  }

  const platforms = new Set(policies.map((p) => platformFromODataType(p["@odata.type"])));
  const platformList = Array.from(platforms).sort().join(", ");

  return [
    {
      id: "intune.policies.exist",
      domain: "intune",
      title: "Compliance policies",
      status: "pass",
      severity: "info",
      summary: `${policies.length} compliance policy(ies) across: ${platformList}.`,
      detail:
        "At least one compliance policy exists. Verify every managed platform in your " +
        "estate has coverage and that policies are assigned to all devices.",
      docsUrl: DOCS.createPolicy,
    },
  ];
}

export async function runCompliancePolicies(graph: GraphClient): Promise<Finding[]> {
  const policies = await graph.getAll<CompliancePolicy>(
    "/deviceManagement/deviceCompliancePolicies",
  );
  return analyzeCompliancePolicies(policies);
}
