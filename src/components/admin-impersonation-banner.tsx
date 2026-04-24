"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ImpersonationState = {
  role: "claimant" | "respondent";
  targetEmail: string;
  targetName: string | null;
} | null;

type Props = {
  caseId: string;
  userRole?: string;
  impersonation: ImpersonationState;
  claimantName: string | null;
  claimantEmail: string | null;
  respondentName: string | null;
  respondentEmail: string | null;
};

export function AdminImpersonationBanner({
  caseId,
  userRole,
  impersonation,
  claimantName,
  claimantEmail,
  respondentName,
  respondentEmail,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (userRole !== "admin") {
    return null;
  }

  async function setRole(role: "claimant" | "respondent") {
    setError(null);
    const response = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, role }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json?.error?.message ?? "Failed to enter impersonation");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function clearRole() {
    setError(null);
    const response = await fetch("/api/admin/impersonate", { method: "DELETE" });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json?.error?.message ?? "Failed to exit impersonation");
      return;
    }
    startTransition(() => router.refresh());
  }

  if (impersonation) {
    const targetLabel =
      impersonation.targetName || impersonation.targetEmail || impersonation.role;
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="font-semibold uppercase tracking-wide">Acting as {impersonation.role}</span>
            <span className="ml-2 text-amber-800">({targetLabel})</span>
            <p className="mt-1 text-xs text-amber-800">
              Actions you take will be recorded in the audit trail with your admin email alongside the impersonated role.
            </p>
          </div>
          <button
            type="button"
            onClick={clearRole}
            disabled={pending}
            className="rounded-full border border-amber-500 bg-white px-4 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Exit impersonation
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    );
  }

  const canClaimant = Boolean(claimantEmail);
  const canRespondent = Boolean(respondentEmail);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Admin view</span>
          <p className="mt-1 text-sm text-slate-700">
            Act on this case as one of the parties for support or testing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRole("claimant")}
            disabled={pending || !canClaimant}
            title={canClaimant ? undefined : "No claimant email on file"}
            className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-800 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            View as Claimant{claimantName ? ` (${claimantName})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setRole("respondent")}
            disabled={pending || !canRespondent}
            title={canRespondent ? undefined : "No respondent email on file"}
            className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-800 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            View as Respondent{respondentName ? ` (${respondentName})` : ""}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
