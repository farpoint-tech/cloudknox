import { Finding, sortFindings } from "../../engine/types";
import { GraphClient, GraphError } from "../../graph/graphClient";
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

function errorFinding(label: string, message: string): Finding {
  return {
    id: `iam.error.${label}`,
    domain: "iam",
    title: `${label} (check failed)`,
    status: "error",
    severity: "info",
    summary: message,
    recommendation:
      "Verify the required read-only Graph permission has admin consent, then re-run.",
  };
}

async function guarded(
  label: string,
  fn: () => Promise<Finding[]>,
  errors: string[],
): Promise<Finding[]> {
  try {
    return await fn();
  } catch (e) {
    const message =
      e instanceof GraphError
        ? `${e.message} (HTTP ${e.status})`
        : e instanceof Error
          ? e.message
          : String(e);
    errors.push(`${label}: ${message}`);
    return [errorFinding(label, message)];
  }
}

/**
 * Run the full IAM assessment. Each check is isolated: one failing check (e.g.
 * a missing permission) produces an error finding rather than aborting the run.
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
    const message =
      e instanceof GraphError ? `${e.message} (HTTP ${e.status})` : String(e);
    errors.push(`conditional-access: ${message}`);
    findings.push(errorFinding("security-defaults", message));
    findings.push(errorFinding("conditional-access", message));
  }

  const tasks: Promise<Finding[]>[] = [];
  if (caPolicies) {
    tasks.push(
      guarded("security-defaults", async () => [await runSecurityDefaults(graph, caPolicies!)], errors),
      guarded("conditional-access", async () => analyzeConditionalAccess(caPolicies!), errors),
    );
  }
  tasks.push(
    guarded("auth-methods", () => runAuthMethods(graph), errors),
    guarded("admins-licenses", () => runAdminsAndLicenses(graph), errors),
    guarded("best-practices", () => runBestPractices(graph), errors),
  );

  const groups = await Promise.all(tasks);
  for (const g of groups) findings.push(...g);

  return { findings: sortFindings(findings), errors };
}
