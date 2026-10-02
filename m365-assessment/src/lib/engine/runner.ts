import { Domain, Finding } from "./types";
import { GraphError } from "../graph/graphClient";

/** A named finding for a check that could not run. */
export function errorFinding(label: string, domain: Domain, message: string): Finding {
  return {
    id: `${domain}.error.${label}`,
    domain,
    title: `${label} (check failed)`,
    status: "error",
    severity: "info",
    summary: message,
    recommendation:
      "Verify the required read-only Graph permission has admin consent, then re-run.",
  };
}

export function describeError(e: unknown): string {
  if (e instanceof GraphError) return `${e.message} (HTTP ${e.status})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Run a check, converting any failure into an error finding (and recording the
 * message in `errors`) so one failing check never aborts the whole assessment.
 */
export async function guarded(
  label: string,
  domain: Domain,
  fn: () => Promise<Finding[]>,
  errors: string[],
): Promise<Finding[]> {
  try {
    return await fn();
  } catch (e) {
    const message = describeError(e);
    errors.push(`${label}: ${message}`);
    return [errorFinding(label, domain, message)];
  }
}
