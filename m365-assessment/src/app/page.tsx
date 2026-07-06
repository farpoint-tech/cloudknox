"use client";

import { useState } from "react";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { GRAPH_SCOPES, isMsalConfigured } from "@/lib/auth/msalConfig";
import { useGraphClient } from "@/lib/auth/useGraphClient";
import { AssessmentResult, runIamAssessment } from "@/lib/assessment/iam";
import { AssessmentView } from "@/components/AssessmentView";

export default function Home() {
  const { instance, accounts } = useMsal();
  const graph = useGraphClient();
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isMsalConfigured();

  const signIn = () => {
    setError(null);
    instance.loginPopup({ scopes: GRAPH_SCOPES }).catch((e) => setError(String(e)));
  };
  const signOut = () => {
    instance.logoutPopup().catch(() => {});
    setResult(null);
  };
  const run = async () => {
    if (!graph) return;
    setRunning(true);
    setError(null);
    try {
      setResult(await runIamAssessment(graph));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">M365 Tenant Assessment</h1>
          <p className="text-sm text-slate-400">
            Read-only Entra ID / IAM posture check · runs entirely in your browser
          </p>
        </div>
        <AuthenticatedTemplate>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </AuthenticatedTemplate>
      </header>

      {!configured && (
        <div className="mt-6 rounded-xl border border-amber-900/50 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="font-medium">App registration not configured.</p>
          <p className="mt-1 text-amber-300/90">
            Set <code>NEXT_PUBLIC_AAD_CLIENT_ID</code> (and optionally{" "}
            <code>NEXT_PUBLIC_AAD_TENANT_ID</code>) to the app registration of a
            SPA with delegated, admin-consented read scopes. See the README.
          </p>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {configured && (
        <>
          <UnauthenticatedTemplate>
            <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center">
              <p className="text-slate-300">
                Sign in with an administrator account to assess this tenant.
              </p>
              <button
                onClick={signIn}
                className="mt-4 rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500"
              >
                Sign in with Microsoft
              </button>
            </div>
          </UnauthenticatedTemplate>

          <AuthenticatedTemplate>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={run}
                disabled={running || !graph}
                className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {running ? "Running assessment…" : "Run IAM assessment"}
              </button>
              {accounts[0] && (
                <span className="text-sm text-slate-400">{accounts[0].username}</span>
              )}
            </div>

            {result && <AssessmentView result={result} />}
          </AuthenticatedTemplate>
        </>
      )}

      <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
        Domain covered: IAM (identity, MFA, Conditional Access, PIM/licensing).
        Defender, Exchange, DLP and Intune are on the roadmap.
      </footer>
    </main>
  );
}
