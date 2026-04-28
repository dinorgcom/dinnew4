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
  const parsed = (proposal || {}) as {
    LIABILITY?: "claimant" | "respondent" | "none";
    RANGE_LOW?: number | string;
    RANGE_HIGH?: number | string;
    RATIONALE?: string;
    settlement_proposal?: string;
    settlement_amount?: number | string;
    rationale?: string;
  };
  const initialRangeLow = numericInputValue(parsed.RANGE_LOW);
  const initialRangeHigh = numericInputValue(parsed.RANGE_HIGH ?? parsed.settlement_amount);
  const initialRationale =
    typeof parsed.RATIONALE === "string"
      ? parsed.RATIONALE
      : typeof parsed.rationale === "string"
        ? parsed.rationale
        : typeof parsed.settlement_proposal === "string"
          ? parsed.settlement_proposal
          : "";
  const [rangeLowUsd, setRangeLowUsd] = useState<string>(initialRangeLow);
  const [rangeHighUsd, setRangeHighUsd] = useState<string>(initialRangeHigh);
  const [rationaleText, setRationaleText] = useState<string>(initialRationale);

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
      const rangeLow = rangeLowUsd.trim() !== initialRangeLow.trim() ? parseAmount(rangeLowUsd) : null;
      const rangeHigh = rangeHighUsd.trim() !== initialRangeHigh.trim() ? parseAmount(rangeHighUsd) : null;
      const rationaleEdit = rationaleText.trim() && rationaleText.trim() !== initialRationale.trim()
        ? rationaleText.trim()
        : null;
      const response = await fetch(`/api/cases/${caseId}/arbitration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, rangeLowUsd: rangeLow, rangeHighUsd: rangeHigh, rationaleText: rationaleEdit }),
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
          <div className="rounded-2xl bg-emerald-50 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Proposed net range</div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                <div className="text-xs uppercase tracking-[0.14em] text-emerald-700">Net payer</div>
                <div className="mt-2 text-lg font-semibold capitalize text-emerald-950">
                  {parsed.LIABILITY || "Not set"}
                </div>
              </div>
              <label className="rounded-2xl border border-emerald-200 bg-white p-3">
                <span className="text-xs uppercase tracking-[0.14em] text-emerald-700">Range low</span>
                <input
                  value={rangeLowUsd}
                  onChange={(event) => setRangeLowUsd(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 w-full bg-transparent text-lg font-semibold text-emerald-950 focus:outline-none"
                  placeholder="0"
                />
              </label>
              <label className="rounded-2xl border border-emerald-200 bg-white p-3">
                <span className="text-xs uppercase tracking-[0.14em] text-emerald-700">Range high</span>
                <input
                  value={rangeHighUsd}
                  onChange={(event) => setRangeHighUsd(event.target.value)}
                  inputMode="decimal"
                  className="mt-2 w-full bg-transparent text-lg font-semibold text-emerald-950 focus:outline-none"
                  placeholder="0"
                />
              </label>
            </div>
            <div className="mt-3 text-sm text-emerald-800">
              {parsed.LIABILITY === "respondent"
                ? `Respondent pays claimant ${formatMoney(parsed.RANGE_LOW)}-${formatMoney(parsed.RANGE_HIGH)}.`
                : parsed.LIABILITY === "claimant"
                  ? `Claimant pays respondent ${formatMoney(parsed.RANGE_LOW)}-${formatMoney(parsed.RANGE_HIGH)}.`
                  : "No net payment is proposed."}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Rationale</div>
            <textarea
              value={rationaleText}
              onChange={(event) => setRationaleText(event.target.value)}
              rows={18}
              className="mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4 font-mono text-sm leading-7 text-slate-800 focus:border-slate-300 focus:outline-none"
              placeholder="Markdown-formatted arbitration rationale"
            />
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
    </div>
  );
}
