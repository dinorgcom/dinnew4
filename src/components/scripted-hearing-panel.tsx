"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { CheckCircle2, FileText, Gavel, Loader2, Play, Send, ShieldCheck, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

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

function statusTone(status: string) {
  if (status === "in_progress") return "bg-amber-100 text-amber-900 ring-amber-200";
  if (status === "completed") return "bg-emerald-100 text-emerald-900 ring-emerald-200";
  return "bg-slate-100 text-slate-700 ring-slate-200";
}

export function ScriptedHearingPanel({
  caseId,
  caseRole,
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
  const verifyHref = `/verify/start?returnTo=${encodeURIComponent(returnTo)}&force=1` as Route;
  const isParty = caseRole === "claimant" || caseRole === "respondent";
  const bothPartiesKycVerified = claimantKycVerified && respondentKycVerified;
  const currentPartyKycVerified =
    caseRole === "claimant"
      ? claimantKycVerified
      : caseRole === "respondent"
        ? respondentKycVerified
        : true;
  const currentPartyNeedsKyc = isParty && !currentPartyKycVerified;
  const otherPartyNeedsKyc =
    (caseRole === "claimant" && !respondentKycVerified) ||
    (caseRole === "respondent" && !claimantKycVerified);

  function renderKycBadge(role: "claimant" | "respondent", verified: boolean) {
    const label = role === "claimant" ? "Claimant" : "Respondent";
    const isCurrentParty = caseRole === role;
    if (!verified && isCurrentParty) {
      return (
        <Link
          href={verifyHref}
          className="rounded-md bg-ink px-2 py-1 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          Verify your identity
        </Link>
      );
    }

    return (
      <span className={`rounded-md px-2 py-1 ${verified ? "bg-emerald-100 text-emerald-800" : "bg-white text-amber-800"}`}>
        {label} {verified ? "verified" : "not verified"}
      </span>
    );
  }

  function sessionStatusLabel(session: HearingSession) {
    const role = session.participantRole.charAt(0).toUpperCase() + session.participantRole.slice(1);
    return `${role} Hearing ${session.status.replaceAll("_", " ")}`;
  }

  return (
    <section className="din-workspace overflow-hidden rounded-lg">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b din-pane-border bg-white px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Gavel className="h-4 w-4" aria-hidden="true" />
            Hearing
          </div>
          <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-ink">Judge-guided hearing chat</h2>
        </div>
        {!flow?.preparation ? (
          <button
            type="button"
            disabled={isPending}
            onClick={generatePreparation}
            className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            Generate scripts
          </button>
        ) : activeSession ? (
          <div className={cn("rounded-md px-3 py-1.5 text-sm font-semibold capitalize ring-1", statusTone(activeSession.status))}>
            {sessionStatusLabel(activeSession)}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!bothPartiesKycVerified ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Identity verification required
              </div>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Scripted hearings can be prepared after both the claimant and respondent have completed KYC.
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {renderKycBadge("claimant", claimantKycVerified)}
                {renderKycBadge("respondent", respondentKycVerified)}
              </div>
            </div>
            {!currentPartyNeedsKyc && otherPartyNeedsKyc ? (
              <div className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-800">
                Waiting for the other party
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {!flow?.preparation ? (
        <div className="din-subtle-panel p-8">
          <div className="mx-auto max-w-xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-ink ring-1 ring-slate-200">
              <Gavel className="h-6 w-6" aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-ink">Prepare the hearing script</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The judge will prepare party-specific questions and pull relevant evidence into the hearing workspace.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[680px] lg:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside className="border-b din-pane-border bg-white p-3 lg:border-b-0 lg:border-r">
            <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Sessions</div>
            <div className="space-y-1">
              {visibleSessions.map((session) => {
                const active = activeSession?.id === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setActiveSessionId(session.id)}
                    className={cn(
                      "din-rail-item flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition",
                      active && "din-rail-item-active",
                    )}
                  >
                    <span className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
                      active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600",
                    )}>
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold capitalize">{session.participantRole}</span>
                      <span className={cn("mt-0.5 block truncate text-xs", active ? "text-white/70" : "text-slate-500")}>
                        {session.status.replaceAll("_", " ")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {activeSession ? (
            <main className="flex min-w-0 flex-col bg-white">
              <div className="flex items-center justify-between border-b din-pane-border px-5 py-3">
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
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-60"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    Start
                  </button>
                ) : null}
              </div>

              <div className="din-subtle-panel min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                {messages.length === 0 ? (
                  <div className="rounded-lg bg-white p-5 text-sm text-slate-600 ring-1 ring-slate-200">
                    Start the session to receive the judge's first question.
                  </div>
                ) : null}
                {messages.map((message) => {
                  const isJudge = message.senderRole === "judge";
                  const refs = (message.referencedEvidenceIds || [])
                    .map((id) => evidenceById.get(id))
                    .filter((item): item is EvidenceCallout => Boolean(item));
                  return (
                    <div key={message.id} className={cn("flex gap-3", isJudge ? "justify-start" : "justify-end")}>
                      {isJudge ? (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-white">
                          <Gavel className="h-4 w-4" aria-hidden="true" />
                        </div>
                      ) : null}
                      <div className={cn(
                        "max-w-[78ch] rounded-lg px-4 py-3 text-sm leading-6 shadow-sm",
                        isJudge ? "bg-white text-slate-800 ring-1 ring-slate-200" : "bg-ink text-white",
                      )}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] opacity-65">
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
                <div className="border-t din-pane-border bg-white p-4">
                  <div className="din-composer flex gap-2 rounded-lg p-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      rows={2}
                      placeholder="Answer the judge's current question..."
                      className="min-h-14 flex-1 resize-none rounded-md border-0 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      disabled={isPending || !draft.trim() || activeSession.status === "not_started"}
                      onClick={sendMessage}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-md bg-ink text-white hover:bg-slate-800 disabled:opacity-50"
                      aria-label="Send hearing answer"
                    >
                      <Send className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  This hearing session is complete.
                </div>
              )}
            </main>
          ) : (
            <main className="din-subtle-panel p-5 text-sm text-slate-600">
              No session is available for your role yet.
            </main>
          )}

          <aside className="border-t din-pane-border bg-white p-4 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Evidence</div>
                <div className="mt-1 text-sm text-slate-600">{flow.evidence.length} item{flow.evidence.length === 1 ? "" : "s"}</div>
              </div>
              <FileText className="h-5 w-5 text-slate-400" aria-hidden="true" />
            </div>

            <div className="mt-4 space-y-2">
              {flow.evidence.length === 0 ? (
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-500 ring-1 ring-slate-200">
                  Referenced evidence will appear here during the hearing.
                </div>
              ) : (
                flow.evidence.map((item) => (
                  <a
                    key={item.id}
                    href={evidenceDownloadHref(item.id)}
                    download={item.fileName || "evidence"}
                    className="block rounded-md border border-slate-200 bg-white p-3 text-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="line-clamp-2 font-semibold text-slate-900">{evidenceLabel(item)}</div>
                    <div className="mt-1 text-xs capitalize text-slate-500">{item.type.replaceAll("_", " ")}</div>
                    {item.description ? <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">{item.description}</p> : null}
                  </a>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
