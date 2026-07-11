import { Finding } from "../engine/types";
import { GraphClient } from "../graph/graphClient";
import { runIamAssessment } from "./iam";
import { runIntuneAssessment } from "./intune";

export interface AssessmentResult {
  findings: Finding[];
  errors: string[];
}

/** Run every assessment domain and return the combined findings. */
export async function runAssessment(graph: GraphClient): Promise<AssessmentResult> {
  const results = await Promise.all([
    runIamAssessment(graph),
    runIntuneAssessment(graph),
  ]);
  return {
    findings: results.flatMap((r) => r.findings),
    errors: results.flatMap((r) => r.errors),
  };
}
