import { CheckStatus, Finding, Severity } from "@/lib/engine/types";

const STATUS_STYLE: Record<CheckStatus, { label: string; badge: string }> = {
  pass: { label: "PASS", badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  fail: { label: "FAIL", badge: "bg-red-500/15 text-red-300 ring-red-500/30" },
  warning: { label: "WARN", badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  manual: { label: "MANUAL", badge: "bg-sky-500/15 text-sky-300 ring-sky-500/30" },
  error: { label: "ERROR", badge: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30" },
  "not-applicable": { label: "N/A", badge: "bg-slate-500/15 text-slate-300 ring-slate-500/30" },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  medium: "text-amber-400",
  low: "text-yellow-400",
  info: "text-slate-400",
};

function evidenceList(evidence: unknown): string[] | null {
  if (Array.isArray(evidence) && evidence.every((e) => typeof e === "string")) {
    return evidence as string[];
  }
  return null;
}

export function FindingCard({ finding }: { finding: Finding }) {
  const status = STATUS_STYLE[finding.status];
  const showSeverity = finding.status === "fail" || finding.status === "warning";
  const evidence = evidenceList(finding.evidence);

  return (
    <article className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-slate-100">{finding.title}</h3>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${status.badge}`}
        >
          {status.label}
          {showSeverity && (
            <span className={`ml-1 ${SEVERITY_STYLE[finding.severity]}`}>
              · {finding.severity}
            </span>
          )}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-300">{finding.summary}</p>

      {finding.detail && (
        <p className="mt-2 text-sm text-slate-400">{finding.detail}</p>
      )}

      {finding.recommendation && (
        <p className="mt-2 text-sm text-slate-300">
          <span className="font-medium text-slate-200">Recommendation: </span>
          {finding.recommendation}
        </p>
      )}

      {evidence && evidence.length > 0 && (
        <details className="mt-2 text-sm text-slate-400">
          <summary className="cursor-pointer select-none text-slate-300">
            Affected ({evidence.length})
          </summary>
          <ul className="mt-1 list-disc pl-5">
            {evidence.map((e, i) => (
              <li key={i} className="break-all">{e}</li>
            ))}
          </ul>
        </details>
      )}

      {finding.docsUrl && (
        <a
          href={finding.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-xs text-sky-400 hover:text-sky-300"
        >
          Microsoft documentation ↗
        </a>
      )}
    </article>
  );
}
