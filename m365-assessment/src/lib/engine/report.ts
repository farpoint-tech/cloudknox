import {
  AssessmentMetadata,
  CheckStatus,
  DOMAIN_LABEL,
  DOMAIN_ORDER,
  Domain,
  Finding,
  sortFindings,
} from "./types";

export interface ReportInput {
  meta: AssessmentMetadata;
  findings: Finding[];
  errors: string[];
}

const STATUS_ORDER: CheckStatus[] = ["fail", "warning", "manual", "error", "pass", "not-applicable"];

function countByStatus(findings: Finding[]): Record<string, number> {
  return findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});
}

function summaryLine(findings: Finding[]): string {
  const c = countByStatus(findings);
  return STATUS_ORDER.filter((s) => c[s]).map((s) => `${c[s]} ${s}`).join(" · ") || "no findings";
}

/** Machine-readable JSON report (kept client-side; download only). */
export function toJson(input: ReportInput): string {
  return JSON.stringify(
    {
      report: "m365-tenant-assessment",
      meta: input.meta,
      summary: countByStatus(input.findings),
      findings: input.findings,
      errors: input.errors,
    },
    null,
    2,
  );
}

/** Human-readable Markdown report grouped by domain. */
export function toMarkdown(input: ReportInput): string {
  const { meta, findings, errors } = input;
  const lines: string[] = [];

  lines.push("# M365 Tenant Assessment", "");
  if (meta.tenantName || meta.tenantId) {
    lines.push(`- **Tenant:** ${meta.tenantName ?? "(unknown)"}${meta.tenantId ? ` (\`${meta.tenantId}\`)` : ""}`);
  }
  if (meta.account) lines.push(`- **Run by:** ${meta.account}`);
  lines.push(`- **Generated:** ${meta.generatedAt}`);
  lines.push(`- **Summary:** ${summaryLine(findings)}`, "");

  const byDomain = new Map<Domain, Finding[]>();
  for (const f of findings) {
    const list = byDomain.get(f.domain) ?? [];
    list.push(f);
    byDomain.set(f.domain, list);
  }

  for (const domain of DOMAIN_ORDER) {
    const group = byDomain.get(domain);
    if (!group || group.length === 0) continue;
    lines.push(`## ${DOMAIN_LABEL[domain]}`, "");
    for (const f of sortFindings(group)) {
      const sev = f.status === "fail" || f.status === "warning" ? ` · ${f.severity}` : "";
      lines.push(`### [${f.status.toUpperCase()}${sev}] ${f.title}`);
      lines.push(f.summary);
      if (f.detail) lines.push("", f.detail);
      if (f.recommendation) lines.push("", `**Recommendation:** ${f.recommendation}`);
      if (Array.isArray(f.evidence) && f.evidence.length > 0) {
        lines.push("", `**Affected (${f.evidence.length}):** ${(f.evidence as string[]).join(", ")}`);
      }
      if (f.docsUrl) lines.push("", `[Documentation](${f.docsUrl})`);
      lines.push("");
    }
  }

  if (errors.length > 0) {
    lines.push("## Checks that could not run", "");
    for (const e of errors) lines.push(`- ${e}`);
    lines.push("");
  }

  return lines.join("\n");
}
