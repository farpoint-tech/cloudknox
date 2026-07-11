import { AssessmentResult } from "@/lib/assessment/iam";
import { CheckStatus } from "@/lib/engine/types";
import { FindingCard } from "./FindingCard";

const COUNT_ORDER: CheckStatus[] = ["fail", "warning", "manual", "error", "pass"];

const COUNT_STYLE: Record<CheckStatus, string> = {
  fail: "text-red-300",
  warning: "text-amber-300",
  manual: "text-sky-300",
  error: "text-fuchsia-300",
  pass: "text-emerald-300",
  "not-applicable": "text-slate-300",
};

export function AssessmentView({ result }: { result: AssessmentResult }) {
  const counts = result.findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="mt-6">
      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        {COUNT_ORDER.map((status) => (
          <div key={status} className="min-w-[72px]">
            <div className={`text-2xl font-semibold ${COUNT_STYLE[status]}`}>
              {counts[status] ?? 0}
            </div>
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {status}
            </div>
          </div>
        ))}
      </div>

      {result.errors.length > 0 && (
        <div className="mt-4 rounded-xl border border-fuchsia-900/50 bg-fuchsia-950/30 p-3 text-sm text-fuchsia-200">
          <p className="font-medium">Some checks could not run:</p>
          <ul className="mt-1 list-disc pl-5">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid gap-3">
        {result.findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </section>
  );
}
