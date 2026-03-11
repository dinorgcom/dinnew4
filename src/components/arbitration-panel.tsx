"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ArbitrationPanelProps = {
  caseId: string;
  status: string;
  proposal: Record<string, unknown> | null;
  finalDecision: string | null;
};

export function ArbitrationPanel({ caseId, status, proposal, finalDecision }: ArbitrationPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const parsed = (proposal || {}) as {
    claimant_perspective?: string;
    respondent_perspective?: string;
    common_ground?: string[];
    settlement_proposal?: string;
    settlement_amount?: number | string;
    rationale?: string;
    next_steps?: string[];
  };

  async function submit(body: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/cases/${caseId}/arbitration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Arbitration request failed.");
      return;
    }
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI arbitration</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Settlement proposal</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Generate a neutral proposal, then resolve the case from that recommendation or return it to decision.
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => void submit({ action: "generate" }))}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? "Working..." : proposal ? "Regenerate proposal" : "Generate proposal"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] bg-ink p-6 text-white">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Case status</div>
        <div className="mt-3 text-3xl font-semibold tracking-tight capitalize">{status.replaceAll("_", " ")}</div>
        <div className="mt-2 text-sm text-slate-300">{finalDecision || "No final decision recorded yet."}</div>
      </section>

      {!proposal ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No arbitration proposal has been generated yet.
        </section>
      ) : (
        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant perspective</div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.claimant_perspective}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent perspective</div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.respondent_perspective}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Settlement proposal</div>
            <p className="mt-3 text-lg font-semibold text-emerald-950">{parsed.settlement_proposal}</p>
            <div className="mt-2 text-sm text-emerald-800">Amount: {String(parsed.settlement_amount ?? "Not set")}</div>
            <p className="mt-4 text-sm leading-7 text-emerald-950">{parsed.rationale}</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Common ground</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {(parsed.common_ground || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Next steps</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {(parsed.next_steps || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              placeholder="Optional note when rejecting the proposal"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => void submit({ action: "accept" }))}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept proposal
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => void submit({ action: "reject", note }))}
                className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
              >
                Reject proposal
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
