"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

type EvidenceCallout = {
  id: string;
  evidenceNumber: number | null;
  title: string;
  type: string;
  submittedBy: string | null;
  fileName: string | null;
  filePathname: string | null;
  description: string | null;
};

type HearingMessage = {
  id: string;
  sessionId: string;
  senderRole: string;
  content: string;
  scriptItemId: string | null;
  referencedEvidenceIds: string[];
  messageType: string;
  createdAt: string | Date;
};

type HearingSession = {
  id: string;
  participantRole: string;
  participantName: string | null;
  status: string;
  currentScriptItemId: string | null;
  transcriptSummaryJson: Record<string, unknown> | null;
};

type HearingFlow = {
  role: string;
  preparation: Record<string, unknown> | null;
  sessions: HearingSession[];
  messages: HearingMessage[];
  evidence: EvidenceCallout[];
};

type ScriptedHearingPanelProps = {
  caseId: string;
  caseRole: string;
  viewerKycVerified: boolean;
  claimantKycVerified: boolean;
  respondentKycVerified: boolean;
};

function evidenceDownloadHref(id: string) {
  return `/api/files/evidence/${id}` as Route;
}

function evidenceLabel(item: EvidenceCallout) {
  const number = item.evidenceNumber ? `Evidence ${String(item.evidenceNumber).padStart(3, "0")}` : "Evidence";
  return `${number}: ${item.title}`;
}

export function ScriptedHearingPanel({
  caseId,
  caseRole,
  viewerKycVerified,
  claimantKycVerified,
  respondentKycVerified,
}: ScriptedHearingPanelProps) {
  const router = useRouter();
  const [flow, setFlow] = useState<HearingFlow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const response = await fetch(`/api/cases/${caseId}/scripted-hearing`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Failed to load scripted hearing.");
      return;
    }
    setFlow(result.data);
    setError(null);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleSessions = useMemo(() => {
    if (!flow) return [];
    if (caseRole === "moderator") return flow.sessions;
    return flow.sessions.filter((session) => session.participantRole === caseRole);
  }, [caseRole, flow]);

  const activeSession = useMemo(() => {
    if (!flow) return null;
    return flow.sessions.find((session) => session.id === activeSessionId) || visibleSessions[0] || null;
  }, [activeSessionId, flow, visibleSessions]);

  const messages = useMemo(() => {
    if (!flow || !activeSession) return [];
    return flow.messages.filter((message) => message.sessionId === activeSession.id);
  }, [activeSession, flow]);

  const evidenceById = useMemo(() => {
    const map = new Map<string, EvidenceCallout>();
    for (const item of flow?.evidence || []) map.set(item.id, item);
    return map;
  }, [flow]);

  async function post(path: string, body: unknown) {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Request failed.");
      return false;
    }
    await load();
    router.refresh();
    return true;
  }

  function generatePreparation() {
    startTransition(async () => {
      await post(`/api/cases/${caseId}/scripted-hearing`, { action: "generate_preparation" });
    });
  }

  function startSession(sessionId: string) {
    startTransition(async () => {
      await post(`/api/cases/${caseId}/scripted-hearing/${sessionId}`, { action: "start" });
    });
  }

  function sendMessage() {
    if (!activeSession || !draft.trim()) return;
    const content = draft;
    setDraft("");
    startTransition(async () => {
      const ok = await post(`/api/cases/${caseId}/scripted-hearing/${activeSession.id}`, {
        action: "message",
        content,
      });
      if (!ok) setDraft(content);
    });
  }

  const returnTo = `/cases/${caseId}?tab=hearing`;
  const verifyHref = `/verify/start?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const isParty = caseRole === "claimant" || caseRole === "respondent";
  const bothPartiesKycVerified = claimantKycVerified && respondentKycVerified;
  const currentPartyNeedsKyc = isParty && !viewerKycVerified;
  const otherPartyNeedsKyc =
    (caseRole === "claimant" && !respondentKycVerified) ||
    (caseRole === "respondent" && !claimantKycVerified);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Scripted hearing</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">AI judge hearing chat</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            The judge prepares a script after discovery and KYC, asks each party for a narrative, then works through contradictions and evidence.
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={generatePreparation}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {flow?.preparation ? "Regenerate scripts" : "Generate scripts"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!bothPartiesKycVerified ? (
        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-amber-950">Identity verification required</div>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Scripted hearings can be prepared after both the claimant and respondent have completed KYC.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className={`rounded-md px-2 py-1 ${claimantKycVerified ? "bg-emerald-100 text-emerald-800" : "bg-white text-amber-800"}`}>
                  Claimant {claimantKycVerified ? "verified" : "not verified"}
                </span>
                <span className={`rounded-md px-2 py-1 ${respondentKycVerified ? "bg-emerald-100 text-emerald-800" : "bg-white text-amber-800"}`}>
                  Respondent {respondentKycVerified ? "verified" : "not verified"}
                </span>
              </div>
            </div>
            {currentPartyNeedsKyc ? (
              <a
                href={verifyHref}
                className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Verify your identity
              </a>
            ) : otherPartyNeedsKyc ? (
              <div className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-800">
                Waiting for the other party
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!flow?.preparation ? (
        <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No scripted hearing has been prepared yet.
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            {visibleSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSessionId(session.id)}
                className={`w-full rounded-md border px-3 py-3 text-left text-sm transition ${
                  activeSession?.id === session.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
              >
                <div className="font-semibold capitalize">{session.participantRole} hearing</div>
                <div className="mt-1 text-xs opacity-75">{session.status.replaceAll("_", " ")}</div>
              </button>
            ))}
          </div>

          {activeSession ? (
            <div className="rounded-md border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold capitalize text-slate-900">
                    {activeSession.participantRole} hearing
                  </div>
                  <div className="text-xs text-slate-500">
                    {activeSession.participantName || "Participant"} · {activeSession.status.replaceAll("_", " ")}
                  </div>
                </div>
                {activeSession.status === "not_started" ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => startSession(activeSession.id)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
                  >
                    Start
                  </button>
                ) : null}
              </div>

              <div className="max-h-[560px] space-y-4 overflow-y-auto bg-slate-50 p-4">
                {messages.length === 0 ? (
                  <div className="rounded-md bg-white p-4 text-sm text-slate-600">
                    Start the session to receive the judge’s first question.
                  </div>
                ) : null}
                {messages.map((message) => {
                  const isJudge = message.senderRole === "judge";
                  const refs = (message.referencedEvidenceIds || [])
                    .map((id) => evidenceById.get(id))
                    .filter((item): item is EvidenceCallout => Boolean(item));
                  return (
                    <div key={message.id} className={`flex ${isJudge ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[80%] rounded-md px-4 py-3 text-sm leading-6 ${
                        isJudge ? "bg-white text-slate-800" : "bg-ink text-white"
                      }`}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
                          {isJudge ? "Judge" : "You"}
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                        {refs.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {refs.map((item) => (
                              <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                                <div className="font-semibold text-slate-900">{evidenceLabel(item)}</div>
                                <div className="mt-1 capitalize">Form: {item.type.replaceAll("_", " ")}</div>
                                {item.submittedBy ? <div>Submitted by: {item.submittedBy}</div> : null}
                                <a
                                  href={evidenceDownloadHref(item.id)}
                                  download={item.fileName || "evidence"}
                                  className="mt-2 inline-flex rounded-md bg-white px-2 py-1 font-semibold text-slate-800 ring-1 ring-slate-200"
                                >
                                  Download evidence
                                </a>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeSession.status !== "completed" ? (
                <div className="border-t border-slate-200 bg-white p-3">
                  <div className="flex gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={2}
                      placeholder="Answer the judge’s current question..."
                      className="min-h-14 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={isPending || !draft.trim() || activeSession.status === "not_started"}
                      onClick={sendMessage}
                      className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Send
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  This hearing session is complete.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              No session is available for your role yet.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
