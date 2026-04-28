"use client";

import { useEffect, useState } from "react";
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

function numericInputValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return value.replace(/[^0-9.]/g, "");
  return "";
}

function parseAmount(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function formatMoney(value: unknown) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  if (amount === null || !Number.isFinite(amount)) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ArbitrationPanel({ caseId, status, proposal, finalDecision, arbitrationClaimantResponse, arbitrationRespondentResponse, claimantEmail, respondentEmail, user, tokenCosts }: ArbitrationPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const aiAmount = (() => {
    const p = proposal as { RANGE_HIGH?: unknown; settlement_amount?: unknown };
    const raw = p?.RANGE_HIGH ?? p?.settlement_amount;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") {
      const num = Number(raw.replace(/[^0-9.]/g, ""));
      return Number.isFinite(num) ? num : null;
    }
    return null;
  })();
  const [settlementOfferUsd, setSettlementOfferUsd] = useState<string>("");

  // Reset the party offer field whenever the proposal id (or amount) changes,
  // i.e. after a regenerate. Without this useState-only init the input keeps
  // showing the value the user typed against the previous proposal.
  useEffect(() => {
    setSettlementOfferUsd("");
  }, [aiAmount, (proposal as { settlement_proposal?: unknown })?.settlement_proposal]);

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
      const numericOffer = Number(settlementOfferUsd.replace(/[^0-9.]/g, ""));
      const offer = Number.isFinite(numericOffer) && numericOffer > 0 ? numericOffer : null;
      // Send the party's single offer as both rangeLowUsd and rangeHighUsd
      // so the upstream range-based arbitration model treats it as a fixed
      // counter-offer.
      const response = await fetch(`/api/cases/${caseId}/arbitration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          rangeLowUsd: offer,
          rangeHighUsd: offer,
        }),
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
      <section className="rounded-md border border-slate-200 bg-white p-6">
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
            className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : proposal ? "Regenerate proposal" : "Generate proposal"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Personal Status Banner */}
        {(() => {
          const userResponseStatus = getUserResponseStatus();
          if (userResponseStatus === 'accepted') {
            return (
              <div className="mt-4 rounded-md bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-600 rounded-md"></div>
                  <span className="text-sm font-medium text-emerald-900">You have accepted this proposal</span>
                </div>
              </div>
            );
          } else if (userResponseStatus === 'rejected') {
            return (
              <div className="mt-4 rounded-md bg-rose-50 border border-rose-200 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-rose-600 rounded-md"></div>
                  <span className="text-sm font-medium text-rose-900">You have rejected this proposal</span>
                </div>
              </div>
            );
          }
          return null;
        })()}
      </section>

      
      {!proposal ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No arbitration proposal has been generated yet.
        </section>
      ) : (
        <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md bg-emerald-50 p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">AI-suggested amount</div>
              <div className="mt-3 text-3xl font-semibold text-emerald-950">
                ${aiAmount !== null ? aiAmount.toLocaleString() : "—"}
              </div>
              <div className="mt-1 text-xs text-emerald-800">USD</div>
            </div>
            <div className="rounded-md border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Your offer (optional)</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl text-slate-400">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settlementOfferUsd}
                  onChange={(event) => {
                    const cleaned = event.target.value.replace(/[^0-9.]/g, "");
                    setSettlementOfferUsd(cleaned);
                  }}
                  placeholder={aiAmount !== null ? String(aiAmount) : "0"}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-2xl font-semibold focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Set your own number to override the AI suggestion when you act.
              </div>
            </div>
          </div>

          {(() => {
            const p = proposal as {
              RATIONALE?: unknown;
              settlement_proposal?: unknown;
              rationale?: unknown;
              LIABILITY?: unknown;
            };
            const text =
              typeof p.RATIONALE === "string"
                ? p.RATIONALE
                : typeof p.settlement_proposal === "string"
                  ? p.settlement_proposal
                  : typeof p.rationale === "string"
                    ? p.rationale
                    : null;
            const liability = typeof p.LIABILITY === "string" ? p.LIABILITY : null;
            if (!text && !liability) return null;
            return (
              <div className="rounded-md border border-slate-200 p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  AI rationale
                </div>
                {liability ? (
                  <div className="mt-2 text-sm font-semibold text-slate-700">
                    Net payer:{" "}
                    <span className="capitalize text-ink">{liability}</span>
                  </div>
                ) : null}
                {text ? (
                  <div className="mt-3 max-h-[420px] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-700">
                    {text}
                  </div>
                ) : null}
              </div>
            );
          })()}

          {isGenerated && (
            <div className="rounded-md border border-slate-200 p-4">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Optional note when accepting or rejecting the proposal"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void submit({ action: "accept" })}
                  className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  Accept proposal
                </button>
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void submit({ action: "reject", note: note.trim() || undefined })}
                  className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-50"
                >
                  Reject proposal
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tokenCosts ? (
        <section className="rounded-md border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Token spend on din.org so far</div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{tokenCosts.claimant}</div>
              <div className="mt-1 text-xs text-slate-500">tokens</div>
            </div>
            <div className="rounded-md bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent</div>
              <div className="mt-2 text-2xl font-semibold text-ink">{tokenCosts.respondent}</div>
              <div className="mt-1 text-xs text-slate-500">tokens</div>
            </div>
            <div className="rounded-md bg-emerald-50 p-4">
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

    </div>
  );
}
