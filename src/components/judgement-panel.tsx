"use client";

import { Fragment, useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CourtSimulationPanel } from "./court-simulation-panel";

type JudgementPanelProps = {
  caseId: string;
  canModerate: boolean;
  judgement: Record<string, unknown> | null;
  finalDecision: string | null;
};

export function JudgementPanel({ caseId, canModerate, judgement, finalDecision }: JudgementPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showSimulationPanel, setShowSimulationPanel] = useState(false);
  
  // Check for stored simulation on component mount
  useEffect(() => {
    const checkStoredSimulation = async () => {
      try {
        const res = await fetch(`/api/cases/${caseId}/court-simulation`);
        
        if (res.ok) {
          const stored = await res.json();
          
          // Check for simulationResult which contains the actual simulation data
          if (stored && stored.data && stored.data.simulationResult) {
            setShowSimulationPanel(true);
          }
        }
      } catch (err) {
        console.error('Failed to check for stored simulation:', err);
      }
    };

    checkStoredSimulation();
  }, [caseId]);
  
  const parsed = (judgement || {}) as {
    summary?: string;
    claims_analysis?: Array<{ claim?: string; finding?: string; reasoning?: string }>;
    evidence_assessment?: string;
    prevailing_party?: string;
    judgement_summary?: string;
    remedies_ordered?: string[];
    award_amount?: number | string;
    detailed_rationale?: string;
  };

  async function submit(action: "generate" | "accept", method: "single" | "simulation" = "single") {
    setError(null);
    
    if (action === "generate") {
      // Close choice modal immediately when a choice is made
      setShowChoiceModal(false);
      
      if (method === "simulation") {
        setShowSimulationPanel(true);
        return;
      }
    }
    
    const response = await fetch(`/api/cases/${caseId}/judgement`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Judgement request failed.");
      return;
    }
    router.refresh();
  }

  if (showSimulationPanel) {
    return <CourtSimulationPanel caseId={caseId} onBack={() => setShowSimulationPanel(false)} />;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI judgement</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Decision draft</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Generate a structured judgement from the current record, then finalize it when ready.
            </p>
          </div>
          {canModerate ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => setShowChoiceModal(true)}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isPending ? "Working..." : judgement ? "Regenerate judgement" : "Generate judgement"}
            </button>
          ) : null}
        </div>

        {!canModerate ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Only moderators and admins can generate or accept a judgement.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] bg-ink p-6 text-white">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final decision</div>
        <div className="mt-3 text-2xl font-semibold tracking-tight">{finalDecision || "No decision finalized yet."}</div>
      </section>

      {!judgement ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No judgement draft exists yet.
        </section>
      ) : (
        <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Summary</div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.summary}</p>
            <div className="mt-4 text-sm font-semibold text-slate-900">
              Prevailing party: {parsed.prevailing_party || "Not set"}
            </div>
            <div className="mt-1 text-sm text-slate-600">Award amount: {String(parsed.award_amount ?? "Not set")}</div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claims analysis</div>
            <div className="mt-3 space-y-3">
              {(parsed.claims_analysis || []).map((item, index) => (
                <div key={`${item.claim}-${index}`} className="rounded-2xl bg-white p-4">
                  <div className="font-semibold text-slate-900">{item.claim}</div>
                  <div className="mt-2 text-sm text-slate-700">{item.finding}</div>
                  <div className="mt-2 text-sm text-slate-500">{item.reasoning}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Evidence assessment</div>
              <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.evidence_assessment}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Remedies ordered</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {(parsed.remedies_ordered || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 p-5">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Detailed rationale</div>
            <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.detailed_rationale}</p>
          </div>

          {canModerate ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => void submit("accept"))}
                className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept judgement
              </button>
            </div>
          ) : null}
        </section>
      )}
      
      {/* Choice Modal */}
      {showChoiceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Choose Judgement Method</h3>
              <button
                onClick={() => setShowChoiceModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <button
                onClick={() => startTransition(() => submit("generate", "single"))}
                disabled={isPending}
                className="w-full p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Single AI Judgement</h4>
                    <p className="text-sm text-gray-600">
                      {isPending ? "Generating judgement..." : "Quick, direct analysis from one AI model"}
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => startTransition(() => submit("generate", "simulation"))}
                disabled={isPending}
                className="w-full p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">Multi-Agent Court Simulation</h4>
                    <p className="text-sm text-gray-600">
                      {isPending ? "Starting simulation..." : "Live debate between AI lawyers with intelligent stopping"}
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-4 pt-4 border-t">
              <button
                onClick={() => setShowChoiceModal(false)}
                className="w-full py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
