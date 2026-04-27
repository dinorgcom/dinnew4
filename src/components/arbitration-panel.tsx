"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ArbitrationPanelProps = {
  caseId: string;
  status: string;
  proposal: Record<string, unknown> | null;
  finalDecision: string | null;
  arbitrationClaimantResponse?: string | null;
  arbitrationRespondentResponse?: string | null;
  claimantEmail?: string | null;
  respondentEmail?: string | null;
  user?: any;
  tokenCosts?: {
    claimant: number;
    respondent: number;
    other: number;
    total: number;
  };
};

export function ArbitrationPanel({ caseId, status, proposal, finalDecision, arbitrationClaimantResponse, arbitrationRespondentResponse, claimantEmail, respondentEmail, user, tokenCosts }: ArbitrationPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [costMin, setCostMin] = useState(0);
  const [costMax, setCostMax] = useState(2000);
  const parsed = (proposal || {}) as {
    claimant_perspective?: string;
    respondent_perspective?: string;
    common_ground?: string[];
    settlement_proposal?: string;
    settlement_amount?: number | string;
    rationale?: string;
    next_steps?: string[];
  };

  // Determine arbitration state from response columns
  const isAccepted = arbitrationClaimantResponse === 'accepted' && arbitrationRespondentResponse === 'accepted';
  const isRejected = arbitrationClaimantResponse === 'rejected' || arbitrationRespondentResponse === 'rejected';
  const isGenerated = arbitrationClaimantResponse == null && arbitrationRespondentResponse == null && proposal;
  
  // Determine current user's response status
  const getUserResponseStatus = () => {
    if (!user?.email) return null;
    
    if (user.email === claimantEmail) {
      if (arbitrationClaimantResponse === 'accepted') return 'accepted';
      if (arbitrationClaimantResponse === 'rejected') return 'rejected';
    } else if (user.email === respondentEmail) {
      if (arbitrationRespondentResponse === 'accepted') return 'accepted';
      if (arbitrationRespondentResponse === 'rejected') return 'rejected';
    }
    return null;
  };
  
  const getRejectedByDisplay = () => {
    if (arbitrationClaimantResponse === 'rejected' && arbitrationRespondentResponse === 'rejected') {
      return "Both parties";
    } else if (arbitrationClaimantResponse === 'rejected') {
      return "Claimant";
    } else if (arbitrationRespondentResponse === 'rejected') {
      return "Respondent";
    }
    return "";
  };

  const getAcceptedByDisplay = () => {
    if (arbitrationClaimantResponse === 'accepted' && arbitrationRespondentResponse === 'accepted') {
      return "Both parties";
    } else if (arbitrationClaimantResponse === 'accepted') {
      return "Claimant";
    } else if (arbitrationRespondentResponse === 'accepted') {
      return "Respondent";
    }
    return "";
  };

  async function submit(body: Record<string, unknown>) {
    setError(null);
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/arbitration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, acceptableCostRange: { min: costMin, max: costMax } }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Arbitration request failed.");
        return;
      }
      setNote("");
      router.refresh();
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI arbitration</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              Settlement proposal
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {isAccepted 
                ? "Both parties have accepted the proposal. The case can proceed to resolution." 
                : isRejected 
                  ? "The proposal has been rejected."
                  : "Generate a neutral proposal, then resolve the case from that recommendation or return it to decision."
              }
            </p>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void submit({ action: "generate" })}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : proposal ? "Regenerate proposal" : "Generate proposal"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Personal Status Banner */}
        {(() => {
          const userResponseStatus = getUserResponseStatus();
          if (userResponseStatus === 'accepted') {
            return (
              <div className="mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-600 rounded-full"></div>
                  <span className="text-sm font-medium text-emerald-900">You have accepted this proposal</span>
                </div>
              </div>
            );
          } else if (userResponseStatus === 'rejected') {
            return (
              <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-200 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-rose-600 rounded-full"></div>
                  <span className="text-sm font-medium text-rose-900">You have rejected this proposal</span>
                </div>
              </div>
            );
          }
          return null;
        })()}
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

          {isGenerated && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Optional note when accepting or rejecting the proposal"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void submit({ action: "accept" })}
                  className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  Accept proposal
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void submit({ action: "reject", note: note.trim() || undefined })}
                  className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
                >
                  Reject proposal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tokenCosts ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Token spend on din.org so far</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{tokenCosts.claimant}</div>
              <div className="mt-1 text-xs text-slate-500">tokens</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{tokenCosts.respondent}</div>
              <div className="mt-1 text-xs text-slate-500">tokens</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Total</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-950">{tokenCosts.total}</div>
              <div className="mt-1 text-xs text-emerald-700">tokens</div>
            </div>
          </div>
          {tokenCosts.other > 0 ? (
            <div className="mt-3 text-xs text-slate-500">
              Plus {tokenCosts.other} tokens spent by other roles (moderator/arbitrator).
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Acceptable arbitration costs</div>
        <p className="mt-2 text-sm text-slate-600">
          Define the cost range you are willing to accept. The values are sent with your offer or response.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Minimum (tokens)</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={costMin}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setCostMin(next);
                  if (next > costMax) setCostMax(next);
                }}
                className="w-full accent-ink"
              />
              <span className="w-16 text-right text-sm font-semibold text-ink">{costMin}</span>
            </div>
          </label>
          <label className="block text-sm">
            <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Maximum (tokens)</span>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={5000}
                step={50}
                value={costMax}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setCostMax(next);
                  if (next < costMin) setCostMin(next);
                }}
                className="w-full accent-ink"
              />
              <span className="w-16 text-right text-sm font-semibold text-ink">{costMax}</span>
            </div>
          </label>
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Range: {costMin} – {costMax} tokens. Adjust before generating, accepting or rejecting.
        </div>
      </section>
    </div>
  );
}
