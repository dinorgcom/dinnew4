"use client";

import { Fragment, type ReactNode, useMemo, useState, useEffect } from "react";

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

interface Props {
  caseId: string;
  onBack: () => void;
}

export function CourtSimulationPanel({ caseId, onBack }: Props) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [liveSimulation, setLiveSimulation] = useState<SimulationPayload | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);
  const [copied, setCopied] = useState(false);

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

  const simulation = useMemo(() => {
    return liveSimulation;
  }, [liveSimulation]);

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
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Judgement
        </button>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Multi-Agent Court Simulation</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Judge-led adversarial debate between Barrister A and Barrister B with intelligent stopping controls.
            </p>
          </div>
          <button
            onClick={runSimulation}
            disabled={running}
            className="rounded-full bg-purple-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 disabled:opacity-50"
          >
            {running ? 'Running simulation...' : simulation ? 'Re-run simulation' : 'Run simulation'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}
      </section>

      {simulation && (
        <div className="mt-6 space-y-5">
          <div className="grid sm:grid-cols-4 gap-3">
            <Metric label="Outcome" value={simulation.outcome.type} />
            <Metric label="Rounds" value={String(simulation.roundsCompleted)} />
            <Metric label="Token use" value={simulation.tokensUsed.toLocaleString()} />
            <Metric label="Session ID" value={simulation.sessionId.slice(0, 10)} />
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-medium text-purple-900">Judge Decision Summary</h4>
            <p className="text-sm text-purple-800 mt-1">{simulation.outcome.summary}</p>
            <p className="text-xs text-purple-700 mt-2">{simulation.stoppingReason}</p>
          </div>

          <OutcomeCard outcome={simulation.outcome} />

          {simulation.outcome.type === 'Abort' && simulation.outcome.needsMoreEvidence && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-medium text-amber-900">Judge Request: More Evidence Needed</h4>
              <p className="text-sm text-amber-800 mt-1">
                The simulation was aborted due to insufficient evidence for a fair determination.
              </p>
              {(simulation.outcome.evidenceRequests || []).length > 0 && (
                <div className="mt-3 space-y-1 text-sm text-amber-900">
                  {(simulation.outcome.evidenceRequests || []).map((request) => (
                    <p key={request}>- {request}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={copyShareLink}
              className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
            >
              {copied ? 'Copied' : 'Copy share link'}
            </button>
            <code className="text-xs text-gray-500">shareToken: {simulation.shareToken}</code>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Live Debate Transcript</h4>
            <ChatTranscript
              entries={simulation.transcript.length > 0 ? simulation.transcript : liveTranscript}
              className="mb-5"
            />

            <h4 className="font-medium text-gray-900 mb-3">Visual Timeline</h4>
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
        </div>
      )}

      {running && liveTranscript.length > 0 && !simulation && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-900 mb-3">Live Debate Transcript</h4>
          <ChatTranscript entries={liveTranscript} />
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
      <h4 className="font-medium text-gray-900">Outcome Detail</h4>
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

function ChatTranscript({
  entries,
  className = '',
}: {
  entries: TranscriptEntry[];
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-[#efeae2] p-3 space-y-2 ${className}`}>
      {entries.map((entry) => {
        const isJudge = entry.speaker === 'judge';
        const isClaimantAttorney = entry.speaker === 'barrister_a';
        return (
          <div
            key={entry.id}
            className={`flex ${isJudge ? 'justify-center' : isClaimantAttorney ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[88%] rounded-xl px-3 py-2 shadow-sm ${
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
