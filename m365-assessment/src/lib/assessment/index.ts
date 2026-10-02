import { AssessmentMetadata, Finding } from "../engine/types";
import { AssessmentContext } from "./context";
import { runIamAssessment } from "./iam";
import { runIntuneAssessment } from "./intune";
import { runDefenderAssessment } from "./defender";
import { runDefenderEndpointAssessment } from "./defenderEndpoint";
import { runExchangeAssessment } from "./exchange";
import { runDlpAssessment } from "./dlp";

export type { AssessmentContext } from "./context";

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

/**
 * Run every assessment domain and return the combined findings + metadata.
 * Graph domains (IAM, Intune, Defender Secure Score) run everywhere; desktop-only
 * domains (Defender for Endpoint, Exchange, DLP) run for real in the Tauri build
 * and otherwise surface a "desktop-only" note.
 */
export async function runAssessment(
  ctx: AssessmentContext,
  opts: RunOptions = {},
): Promise<AssessmentResult> {
  const { graph } = ctx;

  const [iam, intune, defender, mde, exchange, dlp] = await Promise.all([
    runIamAssessment(graph),
    runIntuneAssessment(graph),
    runDefenderAssessment(graph),
    runDefenderEndpointAssessment(ctx),
    runExchangeAssessment(ctx),
    runDlpAssessment(ctx),
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

  const groups = [iam, intune, defender, mde, exchange, dlp];
  return {
    meta,
    findings: groups.flatMap((g) => g.findings),
    errors: groups.flatMap((g) => g.errors),
  };
}
