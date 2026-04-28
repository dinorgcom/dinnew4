"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTION_COSTS } from "@/server/billing/config";

const JUROR_OPTIONS = [1, 3, 5, 7] as const;

type Props = {
  caseId: string;
  canRequest: boolean;
};

export function AppealPanel({ caseId, canRequest }: Props) {
  const router = useRouter();
  const [jurors, setJurors] = useState<(typeof JUROR_OPTIONS)[number]>(3);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const totalCost = useMemo(
    () => ACTION_COSTS.appeal_request * jurors,
    [jurors],
  );

  async function submit() {
    if (!canRequest) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/appeal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jurors, reason: reason.trim() || undefined }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error?.message || "Appeal request failed.");
      }
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Appeal request failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 space-y-4 rounded-md border border-slate-200 p-5">
      <div>
        <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Number of jurors
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {JUROR_OPTIONS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setJurors(count)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
                jurors === count
                  ? "bg-ink text-white"
                  : "border border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              {count} {count === 1 ? "juror" : "jurors"}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Odd numbers prevent ties. Maximum 7.
        </p>
      </div>
      <div>
        <label className="text-xs uppercase tracking-[0.16em] text-slate-500">
          Reason for appeal (optional)
        </label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Briefly explain why you believe the judgement should be reviewed."
          className="mt-2 w-full rounded-md border border-slate-300 px-4 py-3 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-4">
        <div className="text-sm text-slate-700">
          <span className="font-semibold text-ink">{totalCost} tokens</span>{" "}
          ({ACTION_COSTS.appeal_request} × {jurors})
        </div>
        <button
          type="button"
          disabled={!canRequest || submitting || submitted}
          onClick={() => void submit()}
          className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitted
            ? "Appeal submitted"
            : submitting
              ? "Submitting..."
              : `Request appeal (${totalCost} tokens)`}
        </button>
      </div>
      {!canRequest ? (
        <p className="text-xs text-slate-500">
          Only the claimant or respondent can request an appeal.
        </p>
      ) : null}
      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
