import { AssessmentMetadata, Finding } from "../engine/types";
import { GraphClient } from "../graph/graphClient";
import { runIamAssessment } from "./iam";
import { runIntuneAssessment } from "./intune";

export interface AssessmentResult {
  meta: AssessmentMetadata;
  findings: Finding[];
  errors: string[];
}

export interface RunOptions {
  /** Signed-in account (UPN) recorded in the report metadata. */
  account?: string;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

/** Run every assessment domain and return the combined findings + metadata. */
export async function runAssessment(
  graph: GraphClient,
  opts: RunOptions = {},
): Promise<AssessmentResult> {
  const [iam, intune] = await Promise.all([
    runIamAssessment(graph),
    runIntuneAssessment(graph),
  ]);

  let tenantName: string | undefined;
  let tenantId: string | undefined;
  try {
    const orgs = await graph.getAll<{ id?: string; displayName?: string }>("/organization");
    tenantName = orgs[0]?.displayName;
    tenantId = orgs[0]?.id;
  } catch {
    // Tenant metadata is best-effort; the assessment still stands without it.
  }

  const now = opts.now ? opts.now() : new Date();
  const meta: AssessmentMetadata = {
    generatedAt: now.toISOString(),
    tenantName,
    tenantId,
    account: opts.account,
  };

  return {
    meta,
    findings: [...iam.findings, ...intune.findings],
    errors: [...iam.errors, ...intune.errors],
  };
}
