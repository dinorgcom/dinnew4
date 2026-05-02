"use client";

import { useState } from "react";

type Props = {
  partyName: string;
  side: "claimant" | "respondent";
  caseNumber: string;
  caseTitle: string;
  token: string;
  pendingApproval: boolean;
};

export function PartyAcceptPage({
  partyName,
  side,
  caseNumber,
  caseTitle,
  token,
  pendingApproval,
}: Props) {
  const [submitting, setSubmitting] = useState<"accept" | "decline" | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sideLabel = side === "claimant" ? "co-claimant" : "co-respondent";

  async function submit(action: "accept" | "decline") {
    if (submitting) return;
    setSubmitting(action);
    setError(null);
    try {
      const response = await fetch(`/api/party/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Action failed");
        return;
      }
      setDone(action === "accept" ? "accepted" : "declined");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4 py-12">
      <div className="w-full max-w-lg space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Hello {partyName},
          </h1>
          <p className="text-sm text-slate-500">
            You have been invited to join arbitration case
            {" "}
            <span className="font-semibold text-slate-700">{caseNumber}</span>
            {" "}as a{" "}
            <span className="font-semibold text-slate-700">{sideLabel}</span>.
          </p>
          <p className="text-xs text-slate-400">{caseTitle}</p>
        </div>

        {pendingApproval ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            This invitation is currently waiting on approval from the existing
            parties on the case. You will receive a separate email once it has
            been approved and you can join.
          </div>
        ) : null}

        {done === "accepted" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            You have joined the case. Sign in with this email address from your
            dashboard to access the case.
          </div>
        ) : done === "declined" ? (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            You declined this invitation. You can close this page.
          </div>
        ) : (
          <div className="space-y-3 text-sm text-slate-600">
            <p>
              By accepting, you join the case as a {sideLabel} and can review
              all evidence, witnesses, lawyers and proceedings on your side.
              You can also add your own evidence, witnesses, consultants and
              lawyers.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                disabled={submitting !== null || pendingApproval}
                onClick={() => void submit("accept")}
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {submitting === "accept" ? "Accepting..." : "Accept invitation"}
              </button>
              <button
                type="button"
                disabled={submitting !== null}
                onClick={() => void submit("decline")}
                className="rounded-md border border-rose-300 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-400 disabled:opacity-60"
              >
                {submitting === "decline" ? "Declining..." : "Decline"}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
