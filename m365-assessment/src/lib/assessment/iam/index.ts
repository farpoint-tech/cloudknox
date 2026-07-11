import { Finding, sortFindings } from "../../engine/types";
import { describeError, errorFinding, guarded } from "../../engine/runner";
import { GraphClient } from "../../graph/graphClient";
import { runAdminsAndLicenses } from "./adminsAndLicenses";
import { runAuthMethods } from "./authMethods";
import {
  analyzeConditionalAccess,
  fetchConditionalAccessPolicies,
} from "./conditionalAccess";
import { ConditionalAccessPolicy } from "./graphTypes";
import { runBestPractices } from "./bestPractices";
import { runSecurityDefaults } from "./securityDefaults";

export interface AssessmentResult {
  findings: Finding[];
  /** Human-readable messages for checks that could not run. */
  errors: string[];
}

/**
 * Run the IAM assessment. Each check is isolated: one failing check (e.g. a
 * missing permission) produces an error finding rather than aborting the run.
 */
export async function runIamAssessment(graph: GraphClient): Promise<AssessmentResult> {
  const errors: string[] = [];
  const findings: Finding[] = [];

  // Conditional Access policies are shared by the Security Defaults check and
  // the CA checks — fetch once.
  let caPolicies: ConditionalAccessPolicy[] | null = null;
  try {
    caPolicies = await fetchConditionalAccessPolicies(graph);
  } catch (e) {
    const message = describeError(e);
    errors.push(`conditional-access: ${message}`);
    findings.push(errorFinding("security-defaults", "iam", message));
    findings.push(errorFinding("conditional-access", "iam", message));
  }

  const tasks: Promise<Finding[]>[] = [];
  if (caPolicies) {
    const policies = caPolicies;
    tasks.push(
      guarded("security-defaults", "iam", async () => [await runSecurityDefaults(graph, policies)], errors),
      guarded("conditional-access", "iam", async () => analyzeConditionalAccess(policies), errors),
    );
  }
  tasks.push(
    guarded("auth-methods", "iam", () => runAuthMethods(graph), errors),
    guarded("admins-licenses", "iam", () => runAdminsAndLicenses(graph), errors),
    guarded("best-practices", "iam", () => runBestPractices(graph), errors),
  );

  const groups = await Promise.all(tasks);
  for (const g of groups) findings.push(...g);

  return { findings: sortFindings(findings), errors };
}
