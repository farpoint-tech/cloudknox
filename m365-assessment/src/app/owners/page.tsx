"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
  useMsal,
} from "@azure/msal-react";
import { GRAPH_SCOPES, OWNER_WRITE_SCOPES, isMsalConfigured } from "@/lib/auth/msalConfig";
import { useGraphClient } from "@/lib/auth/useGraphClient";
import {
  assignOwner,
  categoryOf,
  listEnterpriseApps,
  resolveUserByUpn,
  type AssignmentResult,
  type EnterpriseApp,
  type GraphUser,
} from "@/lib/owners/ownerService";

type Step = "browse" | "preview" | "done";

export default function OwnersPage() {
  const { instance } = useMsal();
  // Write scope is added here only (incremental consent); the assessment
  // pages keep their read-only token.
  const graph = useGraphClient(OWNER_WRITE_SCOPES);

  const [apps, setApps] = useState<EnterpriseApp[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyOwnerless, setOnlyOwnerless] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [upn, setUpn] = useState("");
  const [owner, setOwner] = useState<GraphUser | null>(null);
  const [step, setStep] = useState<Step>("browse");
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<AssignmentResult[] | null>(null);

  const configured = isMsalConfigured();

  const signIn = () => {
    setError(null);
    instance
      .loginPopup({ scopes: [...GRAPH_SCOPES, ...OWNER_WRITE_SCOPES] })
      .catch((e) => setError(String(e)));
  };

  const load = async () => {
    if (!graph) return;
    setLoading(true);
    setError(null);
    try {
      setApps(await listEnterpriseApps(graph));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const categories = useMemo(() => {
    if (!apps) return [];
    return Array.from(new Set(apps.map(categoryOf))).sort();
  }, [apps]);

  const filtered = useMemo(() => {
    if (!apps) return [];
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      if (onlyOwnerless && a.owners.length > 0) return false;
      if (category !== "all" && categoryOf(a) !== category) return false;
      if (q && !a.displayName.toLowerCase().includes(q) && !a.appId.includes(q)) return false;
      return true;
    });
  }, [apps, search, category, onlyOwnerless]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.filter((a) => a.owners.length === 0).map((a) => a.id)));
  };

  const toPreview = async () => {
    if (!graph) return;
    setError(null);
    try {
      const user = await resolveUserByUpn(graph, upn);
      if (!user) {
        setError(`User '${upn}' not found.`);
        return;
      }
      setOwner(user);
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const apply = async () => {
    if (!graph || !owner || !apps) return;
    setApplying(true);
    setError(null);
    try {
      const targets = apps.filter((a) => selected.has(a.id));
      const res = await assignOwner(graph, targets, owner.id);
      setResults(res);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  };

  const reset = () => {
    setStep("browse");
    setResults(null);
    setOwner(null);
    setSelected(new Set());
    void load();
  };

  const selectedApps = apps?.filter((a) => selected.has(a.id)) ?? [];
  const counts = results
    ? {
        assigned: results.filter((r) => r.status === "assigned").length,
        skipped: results.filter((r) => r.status === "skipped-has-owner").length,
        errors: results.filter((r) => r.status === "error").length,
      }
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Enterprise App Owners</h1>
          <p className="text-sm text-slate-400">
            Assign owners to ownerless Enterprise Apps · requires Application.ReadWrite.All
            (requested on sign-in for this page only)
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          ← Assessment
        </Link>
      </header>

      {!configured && (
        <p className="mt-6 rounded-lg border border-amber-700 bg-amber-950/40 p-4 text-sm text-amber-300">
          NEXT_PUBLIC_AAD_CLIENT_ID is not configured.
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
          {error}
        </p>
      )}

      <UnauthenticatedTemplate>
        <div className="mt-8">
          <button
            onClick={signIn}
            disabled={!configured}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Sign in with Microsoft
          </button>
        </div>
      </UnauthenticatedTemplate>

      <AuthenticatedTemplate>
        {step === "browse" && (
          <>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={load}
                disabled={loading}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {loading ? "Loading…" : apps ? "Reload apps" : "Load Enterprise Apps"}
              </button>
              {apps && (
                <>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or App ID…"
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={onlyOwnerless}
                      onChange={(e) => setOnlyOwnerless(e.target.checked)}
                    />
                    Only without owner
                  </label>
                  <button
                    onClick={selectAllFiltered}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Select all ownerless ({filtered.filter((a) => a.owners.length === 0).length})
                  </button>
                </>
              )}
            </div>

            {apps && (
              <>
                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-900 text-left text-slate-400">
                      <tr>
                        <th className="px-3 py-2" />
                        <th className="px-3 py-2">App</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2">Owners</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((a) => (
                        <tr key={a.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(a.id)}
                              disabled={a.owners.length > 0}
                              onChange={() => toggle(a.id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{a.displayName}</div>
                            <div className="text-xs text-slate-500">{a.appId}</div>
                          </td>
                          <td className="px-3 py-2 text-slate-300">{categoryOf(a)}</td>
                          <td className="px-3 py-2">
                            {a.owners.length === 0 ? (
                              <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
                                No owner
                              </span>
                            ) : (
                              <span className="text-slate-300">
                                {a.owners
                                  .map((o) => o.userPrincipalName ?? o.displayName ?? o.id)
                                  .join(", ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                            No apps match the current filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <input
                    value={upn}
                    onChange={(e) => setUpn(e.target.value)}
                    placeholder="new-owner@yourdomain.com"
                    className="w-72 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={toPreview}
                    disabled={selected.size === 0 || upn.trim() === ""}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    Preview assignment ({selected.size})
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === "preview" && owner && (
          <div className="mt-6">
            <p className="text-sm text-slate-300">
              Assign <span className="font-medium text-white">{owner.displayName}</span> (
              {owner.userPrincipalName}) as owner to{" "}
              <span className="font-medium text-white">{selectedApps.length}</span> app(s). Apps
              that already have an owner will be skipped. Nothing is removed.
            </p>
            <ul className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
              {selectedApps.map((a) => (
                <li key={a.id}>{a.displayName}</li>
              ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <button
                onClick={apply}
                disabled={applying}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {applying ? "Applying…" : "Confirm & assign"}
              </button>
              <button
                onClick={() => setStep("browse")}
                disabled={applying}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {step === "done" && results && counts && (
          <div className="mt-6">
            <p className="text-sm text-slate-300">
              <span className="text-emerald-400">{counts.assigned} assigned</span> ·{" "}
              <span className="text-slate-400">{counts.skipped} skipped (had owner)</span> ·{" "}
              <span className="text-red-400">{counts.errors} errors</span>
            </p>
            <ul className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-800 p-3 text-sm">
              {results.map((r) => (
                <li key={r.app.id} className="py-0.5">
                  {r.status === "assigned" && <span className="text-emerald-400">✓ </span>}
                  {r.status === "skipped-has-owner" && <span className="text-slate-500">– </span>}
                  {r.status === "error" && <span className="text-red-400">✗ </span>}
                  <span className="text-slate-300">{r.app.displayName}</span>
                  {r.message && <span className="text-xs text-red-400"> — {r.message}</span>}
                </li>
              ))}
            </ul>
            <button
              onClick={reset}
              className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
            >
              Back to app list
            </button>
          </div>
        )}
      </AuthenticatedTemplate>
    </main>
  );
}
