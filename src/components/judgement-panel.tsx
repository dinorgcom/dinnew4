"use client";

import { Fragment, type ReactNode, useMemo, useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

interface TranscriptEntry {
  id: string;
  round: number;
  speaker: 'judge' | 'barrister_a' | 'barrister_b';
  content: string;
  createdAt: string;
}

interface SimulationStep {
  id: string;
  round: number;
  label: string;
  highlight: string;
}

interface SimulationOutcome {
  type: 'Settlement' | 'Verdict' | 'Abort';
  summary: string;
  terms?: string[];
  amount?: number | null;
  winner?: 'PartyA' | 'PartyB';
  reasoning?: string;
  relief?: string;
  reason?: string;
  keyPoints?: string[];
  needsMoreEvidence?: boolean;
  evidenceRequests?: string[];
}

interface SimulationPayload {
  sessionId: string;
  shareToken: string;
  stoppingReason: string;
  roundsCompleted: number;
  tokensUsed: number;
  outcome: SimulationOutcome;
  transcript: TranscriptEntry[];
  timeline: {
    publicSharePath: string;
    steps: SimulationStep[];
  };
}

type JudgementPanelProps = {
  caseId: string;
  canModerate: boolean;
  judgement: Record<string, unknown> | null;
  finalDecision: string | null;
  caseStatus: string;
};

export function JudgementPanel({ caseId, canModerate, judgement, finalDecision, caseStatus }: JudgementPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveSimulation, setLiveSimulation] = useState<SimulationPayload | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Override judgement prop during refresh to prevent cached data from showing
  const currentJudgement = isRefreshing ? null : judgement;
  
  const parsed = (currentJudgement || {}) as {
    summary?: string;
    claims_analysis?: Array<{ claim?: string; finding?: string; reasoning?: string }>;
    evidence_assessment?: string;
    prevailing_party?: string;
    judgement_summary?: string;
    remedies_ordered?: string[];
    award_amount?: number | string;
    detailed_rationale?: string;
  };

  // Load stored simulation on component mount
  useEffect(() => {
    const loadStoredSimulation = async () => {
      try {
        const res = await fetch(`/api/cases/${caseId}/court-simulation`);
        
        if (res.ok) {
          const stored = await res.json();
          
          // The actual simulation data is nested in stored.data.simulationResult
          const simulationResult = stored.data?.simulationResult;
          
          if (simulationResult) {
            setLiveSimulation({
              sessionId: stored.data?.simulationSessionId,
              shareToken: stored.data?.simulationShareToken,
              stoppingReason: stored.data?.simulationStoppingReason,
              roundsCompleted: Number(stored.data?.simulationRounds),
              tokensUsed: Number(stored.data?.simulationTokensUsed),
              outcome: simulationResult.outcome,
              transcript: simulationResult.transcript || [],
              timeline: stored.data?.simulationTimeline || [],
            });
            
            // Convert stored transcript to the expected format
            if (simulationResult.transcript) {
              const transcript = simulationResult.transcript.map((entry: any) => ({
                id: entry.id,
                round: entry.round,
                speaker: entry.speaker,
                content: entry.content,
                createdAt: entry.createdAt,
              }));
              setLiveTranscript(transcript);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load stored simulation:', err);
      }
    };

    loadStoredSimulation();
  }, [caseId]);

  // Click outside to close functionality
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showChoiceModal) {
        const target = event.target as Element;
        const choicePanel = document.querySelector('[data-choice-panel]');
        
        // Check if click is outside the choice panel and not on the trigger button
        if (choicePanel && !choicePanel.contains(target)) {
          const triggerButton = document.querySelector('[data-trigger-button]');
          if (triggerButton && !triggerButton.contains(target)) {
            setShowChoiceModal(false);
          }
        }
      }
    };

    if (showChoiceModal) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showChoiceModal]);

  const simulation = useMemo(() => {
    // Return null during refresh to prevent cached data from showing
    if (isRefreshing) return null;
    return liveSimulation;
  }, [liveSimulation, isRefreshing]);

  async function submit(action: "generate" | "accept", method: "single" | "simulation" = "single") {
    setError(null);
    
    if (action === "generate") {
      // Close choice modal immediately when a choice is made
      setShowChoiceModal(false);
      
      // Clear old data immediately to prevent showing old content during refresh
      setLiveSimulation(null);
      setLiveTranscript([]);
      
      if (method === "simulation") {
        runSimulation();
        return;
      } else {
        // Set running state for single AI analysis too
        setRunning(true);
      }
    }
    
    try {
      // Only send fields relevant to the action type
      const requestBody: any = { action };
      if (action === "generate") {
        requestBody.clearSimulationData = method === "single"; // Clear simulation data for single AI
        requestBody.clearDataImmediately = true; // Clear all data immediately to prevent flicker
      }

      const response = await fetch(`/api/cases/${caseId}/judgement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      
      const result = await response.json();

      if (!response.ok) {
        console.error('Judgement request failed:', result);
        setError(result.error?.message || "Judgement request failed.");
        return;
      }
      
      // Set refreshing state to hide cached data during refresh
      setIsRefreshing(true);
      
      // Add a small delay to ensure database updates are processed before refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use router.refresh() - the isRefreshing state will hide any cached data
      router.refresh();
      
      // Clear refreshing state after a longer delay to completely cover the flicker window
      setTimeout(() => setIsRefreshing(false), 2000);
    } finally {
      // Clear running state for single AI analysis
      if (method === "single") {
        setRunning(false);
      }
    }
  }

  const runSimulation = async () => {
    if (running) return; // Prevent double-clicks
    
    setRunning(true);
    setError('');
    setLiveSimulation(null);
    setLiveTranscript([]);

    try {
      const res = await fetch(`/api/cases/${caseId}/court-simulation/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxRounds: 8,
          maxTokens: 40000,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to run simulation');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventType = '';

      const handleEvent = (type: string, payloadText: string) => {
        if (!payloadText) return;
        const payload = JSON.parse(payloadText) as unknown;

        if (type === 'entry') {
          const entry = payload as TranscriptEntry;
          setLiveTranscript((prev) => [...prev, entry]);
          return;
        }

        if (type === 'result') {
          setLiveSimulation(payload as SimulationPayload);
          return;
        }

        if (type === 'error') {
          const err = payload as { message?: string };
          throw new Error(err.message || 'Failed to run simulation');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const lines = chunk.split('\n');
          let data = '';
          eventType = '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice('event: '.length).trim();
            } else if (line.startsWith('data: ')) {
              data += line.slice('data: '.length);
            }
          }

          if (eventType && data) {
            handleEvent(eventType, data);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run simulation');
    } finally {
      setRunning(false);
      setError('');
      
      // Set refreshing state to hide cached data during refresh
      setIsRefreshing(true);
      
      // Add a small delay to ensure database updates are processed before refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Use router.refresh() - the isRefreshing state will hide any cached data
      router.refresh();
      
      // Clear refreshing state after a longer delay to completely cover the flicker window
      setTimeout(() => setIsRefreshing(false), 2000);
    }
  };

  const copyShareLink = async () => {
    if (!simulation?.timeline.publicSharePath) return;
    const shareUrl = `${window.location.origin}${simulation.timeline.publicSharePath}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-6">
      {/* Controls Section */}
      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Court Analysis</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">AI-Powered Judgment</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Generate comprehensive analysis through multi-agent court simulation and AI judgment.
            </p>
          </div>
          {canModerate ? (
            <div className="relative">
              <button
                type="button"
                disabled={isPending || running}
                onClick={() => setShowChoiceModal(!showChoiceModal)}
                data-trigger-button
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {(isPending || running) ? "Generating..." : (judgement || simulation) ? "Regenerate analysis" : "Start analysis"}
              </button>
              
              {/* Inline Choice Panel - positioned absolutely to not move button */}
              {showChoiceModal && (
                <div className="absolute top-full left-0 mt-2 z-10 w-full max-w-xs sm:w-80">
                  <div className="rounded-md border border-gray-200 bg-white p-4 shadow-lg" data-choice-panel>
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-medium text-gray-900">Choose analysis type:</div>
                      <button
                        onClick={() => setShowChoiceModal(false)}
                        className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={async () => { await submit("generate", "single"); }}
                        disabled={isPending || running}
                        className="w-full p-3 sm:p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
                            <div className="w-3 h-3 bg-blue-600 rounded-md"></div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 text-sm">Single AI Analysis</div>
                            <div className="text-xs text-gray-600 mt-0.5">Quick, direct analysis from one AI model</div>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={async () => { await submit("generate", "simulation"); }}
                        disabled={isPending || running}
                        className="w-full p-3 sm:p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 bg-purple-100 rounded-md flex items-center justify-center flex-shrink-0">
                            <div className="w-3 h-3 bg-purple-600 rounded-md"></div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-gray-900 text-sm">Multi-Agent Court Simulation</div>
                            <div className="text-xs text-gray-600 mt-0.5">Live debate between AI lawyers</div>
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {!canModerate ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Only moderators and admins can generate or accept a judgement.
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      {/* Success Banner - When judgement is accepted */}
      {caseStatus === "resolved" && !isPending && !running && !isRefreshing && (
        <section className="rounded-md bg-emerald-50 border border-emerald-200 p-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-600 rounded-md"></div>
            <span className="text-sm font-medium text-emerald-900">This judgement has been accepted and the case is resolved</span>
          </div>
        </section>
      )}

      {/* Final Decision Section */}
      {!running && !isRefreshing && (
        <section className="rounded-md bg-ink p-6 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final decision</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight">{finalDecision || "No decision finalized yet."}</div>
        </section>
      )}
      
      {/* Show "..." during refresh to hide cached data */}
      {!running && isRefreshing && (
        <section className="rounded-md bg-ink p-6 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final decision</div>
          <div className="mt-3 text-2xl font-semibold tracking-tight">...</div>
        </section>
      )}

      {/* Unified Decision Analysis Panel */}
      {(currentJudgement || simulation) && !running && !isRefreshing ? (
        <section className="space-y-6 rounded-md border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Analysis Results</div>
          
          {/* Simulation Metrics (if available) */}
          {simulation && (
            <div className="grid sm:grid-cols-4 gap-3">
              <Metric label="Analysis Type" value="Multi-Agent Simulation" />
              <Metric label="Rounds" value={String(simulation.roundsCompleted)} />
              <Metric label="Token use" value={simulation.tokensUsed.toLocaleString()} />
              <Metric label="Session ID" value={simulation.sessionId.slice(0, 10)} />
            </div>
          )}

          {/* Primary Decision Summary */}
          {currentJudgement && parsed.summary && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900">Analysis Summary</h4>
              <p className="text-sm text-blue-800 mt-1">{parsed.summary}</p>
            </div>
          )}

          {/* Detailed Analysis */}
          <div className="space-y-6">
            {/* Claims Analysis */}
            {currentJudgement && (
              <div className="rounded-md bg-slate-50 p-5">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claims Analysis</div>
                <div className="mt-3 space-y-3">
                  {(parsed.claims_analysis || []).map((item, index) => (
                    <div key={`${item.claim}-${index}`} className="rounded-md bg-white p-4">
                      <div className="font-semibold text-slate-900">{item.claim}</div>
                      <div className="mt-2 text-sm text-slate-700">{item.finding}</div>
                      <div className="mt-2 text-sm text-slate-500">{item.reasoning}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Assessment */}
            {currentJudgement && (
              <div className="rounded-md bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Evidence Assessment</div>
                <p className="mt-3 text-sm leading-7 text-slate-700">{parsed.evidence_assessment}</p>
              </div>
            )}

            {/* Key Decision Points */}
            {(simulation?.outcome || currentJudgement) && (
              <div className="rounded-md bg-slate-50 p-4 lg:col-span-2">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Key Decision Points</div>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <div><strong>Prevailing Party:</strong> {
                    parsed.prevailing_party === 'split' 
                      ? 'No prevailing party determined' 
                      : parsed.prevailing_party === 'claimant' 
                        ? 'Claimant'
                        : parsed.prevailing_party === 'respondent'
                          ? 'Respondent'
                          : simulation?.outcome?.winner === 'PartyA' 
                            ? 'Claimant' 
                            : simulation?.outcome?.winner === 'PartyB' 
                              ? 'Respondent' 
                              : 'Not set'
                  }</div>
                  <div><strong>Award Amount:</strong> {String(parsed.award_amount ?? simulation?.outcome?.amount ?? "Not set")}</div>
                  {simulation?.outcome?.type === 'Abort' && simulation.outcome.needsMoreEvidence && (
                    <div className="mt-3 p-3 bg-amber-100 border border-amber-200 rounded-lg">
                      <div className="font-medium text-amber-900">Additional Evidence Needed</div>
                      {(simulation.outcome.evidenceRequests || []).map((request) => (
                        <div key={request} className="text-sm text-amber-800 mt-1">- {request}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {simulation && (
              <button
                onClick={copyShareLink}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                {copied ? 'Copied' : 'Copy share link'}
              </button>
            )}
            {canModerate && judgement && caseStatus === "awaiting_decision" && (
              <button
                onClick={async () => { await submit("accept"); }}
                disabled={isPending}
                className="rounded-md bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                Accept judgement
              </button>
            )}
          </div>
        </section>
      ) : running ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-md animate-spin"></div>
            <span>Generating analysis...</span>
          </div>
        </section>
      ) : isRefreshing ? (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-md animate-spin"></div>
            <span>Loading new analysis...</span>
          </div>
        </section>
      ) : (
        <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No analysis has been generated yet. Click &quot;Start analysis&quot; to begin.
        </section>
      )}

      {/* Live Debate Transcript */}
      {(simulation && simulation.transcript && simulation.transcript.length > 0) || (running && liveTranscript.length > 0) ? (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-ink">Live Debate Transcript</h3>
          <ChatTranscript
            entries={simulation?.transcript && simulation.transcript.length > 0 ? simulation.transcript : liveTranscript}
            isTyping={running && liveTranscript.length > 0}
            lastSpeaker={liveTranscript.length > 0 ? liveTranscript[liveTranscript.length - 1].speaker : undefined}
            className="mb-5"
          />
        </div>
      ) : null}

      {/* Visual Timeline */}
      {simulation && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-ink">Strategic Timeline</h3>
          <div className="space-y-2">
            {simulation.timeline.steps.map((step) => (
              <div key={step.id} className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500">
                  Round {step.round} · {step.label}
                </p>
                <p className="text-sm text-gray-800 mt-1">{step.highlight}</p>
              </div>
            ))}
          </div>
        </div>
      )}

          </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function OutcomeCard({ outcome }: { outcome: SimulationOutcome }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h4 className="font-medium text-gray-900">Simulation Outcome</h4>
      {outcome.type === 'Settlement' && (
        <div className="text-sm text-gray-700 mt-2 space-y-1">
          {typeof outcome.amount === 'number' && <p>Amount: ${outcome.amount.toLocaleString()}</p>}
          {(outcome.terms || []).map((term) => (
            <p key={term}>- {term}</p>
          ))}
        </div>
      )}

      {outcome.type === 'Verdict' && (
        <div className="text-sm text-gray-700 mt-2 space-y-2">
          <p>Winner: {outcome.winner === 'PartyA' ? 'Party A (Claimant)' : 'Party B (Respondent)'}</p>
          <p>{outcome.reasoning}</p>
          <p className="font-medium">{outcome.relief}</p>
        </div>
      )}

      {outcome.type === 'Abort' && (
        <div className="text-sm text-gray-700 mt-2 space-y-1">
          <p>{outcome.reason}</p>
          {(outcome.keyPoints || []).map((point) => (
            <p key={point}>- {point}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function speakerLabel(speaker: TranscriptEntry['speaker']): string {
  if (speaker === 'judge') return 'Judge';
  if (speaker === 'barrister_a') return 'Barrister A (Claimant)';
  return 'Barrister B (Respondent)';
}

function getNextSpeaker(lastSpeaker?: string): string {
  if (!lastSpeaker) return 'barrister_a'; // Start with claimant attorney
  const speakers = ['barrister_a', 'barrister_b', 'judge'];
  const currentIndex = speakers.indexOf(lastSpeaker);
  const nextIndex = (currentIndex + 1) % speakers.length;
  return speakers[nextIndex];
};

function ChatTranscript({
  entries,
  className = '',
  isTyping = false,
  lastSpeaker,
}: {
  entries: TranscriptEntry[];
  className?: string;
  isTyping?: boolean;
  lastSpeaker?: string;
}) {
  const nextSpeaker = getNextSpeaker(lastSpeaker);
  return (
    <div className={`rounded-md border border-gray-200 bg-[#efeae2] p-3 space-y-2 ${className}`}>
      {entries.map((entry) => {
        const isJudge = entry.speaker === 'judge';
        const isClaimantAttorney = entry.speaker === 'barrister_a';
        return (
          <div
            key={entry.id}
            className={`flex ${isJudge ? 'justify-center' : isClaimantAttorney ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-md px-3 py-2 shadow-sm ${
                isJudge
                  ? 'bg-amber-100 border border-amber-200'
                  : isClaimantAttorney
                  ? 'bg-green-100 border border-green-200'
                  : 'bg-white border border-gray-200'
              }`}
            >
              <p className="text-[11px] font-semibold text-gray-600">
                Round {entry.round} · {speakerLabel(entry.speaker)}
              </p>
              <div className="text-sm text-gray-900 mt-1 leading-relaxed">
                {renderBasicMarkdown(entry.content)}
              </div>
            </div>
          </div>
        );
      })}
      
      {/* Typing Indicator */}
      {isTyping && (
        <div className={`flex ${
          nextSpeaker === 'judge' ? 'justify-center' : 
          nextSpeaker === 'barrister_a' ? 'justify-end' : 
          'justify-start'
        }`}>
          <div className={`max-w-[88%] rounded-md px-3 py-2 shadow-sm ${
            nextSpeaker === 'judge' ? 'bg-amber-100 border border-amber-200' :
            nextSpeaker === 'barrister_a' ? 'bg-green-100 border border-green-200' :
            'bg-white border border-gray-200'
          }`}>
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-gray-400 rounded-md animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-md animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-gray-400 rounded-md animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderBasicMarkdown(content: string): ReactNode {
  const lines = content.split('\n');
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      nodes.push(
        <ul key={`list-${nodes.length}`} className="list-disc pl-5 my-1 space-y-0.5">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^\s*-\s+(.+)$/);
    if (bulletMatch) {
      listItems.push(<li key={`li-${idx}`}>{renderInlineMarkdown(bulletMatch[1])}</li>);
      return;
    }

    flushList();
    if (!line.trim()) {
      nodes.push(<div key={`br-${idx}`} className="h-2" />);
      return;
    }

    nodes.push(
      <p key={`p-${idx}`} className="my-0.5">
        {renderInlineMarkdown(line)}
      </p>
    );
  });

  flushList();
  return <Fragment>{nodes}</Fragment>;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={idx}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={idx}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code key={idx} className="bg-black/5 px-1 py-0.5 rounded text-[12px]">
          {token.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{token}</Fragment>;
  });
}
