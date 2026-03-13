"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CaseWorkspace } from "@/components/case-workspace";
import { LawyerChatPanel } from "@/components/lawyer-chat-panel";
import { getLawyerById } from "@/lib/lawyers";
import { formatCurrency, formatDateTime } from "@/server/format";

type Claim = {
  claim: string;
  details?: string;
  evidenceIds?: string[];
  witnessIds?: string[];
  responses?: Array<{ response: string; submittedBy: string; submittedDate: string }>;
};

type WorkspaceRecord = {
  id: string;
  createdAt: string | Date;
  [key: string]: unknown;
};

type CaseDetailWorkspaceProps = {
  detail: {
    case: {
      id: string;
      caseNumber: string;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      category: string | null;
      claimAmount: string | null;
      currency: string;
      claimantName: string | null;
      claimantEmail: string | null;
      respondentName: string | null;
      respondentEmail: string | null;
      claimantClaims: Record<string, unknown>[] | null;
      respondentClaims: Record<string, unknown>[] | null;
      claimantLawyerKey: string | null;
      respondentLawyerKey?: string | null;
      hearingDate: string | Date | null;
      arbitratorAssignedName: string | null;
      finalDecision: string | null;
    };
    role: string;
    roleLabel: string;
    evidence: WorkspaceRecord[];
    witnesses: WorkspaceRecord[];
    consultants: WorkspaceRecord[];
    expertiseRequests: WorkspaceRecord[];
    messages: WorkspaceRecord[];
    activities: WorkspaceRecord[];
    conversation: {
      lawyerPersonality?: string | null;
      contextSummary?: string | null;
      messagesJson?: Record<string, unknown>[] | null;
    } | null;
    todoItems: Array<{ key: string; label: string }>;
    progressStages: Array<{ key: string; label: string; active: boolean }>;
  };
};

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "claims", label: "Claims" },
  { key: "evidence", label: "Evidence" },
  { key: "witnesses", label: "Witnesses" },
  { key: "consultants", label: "Consultants" },
  { key: "expertise", label: "Expertise" },
  { key: "todo", label: "To-do" },
  { key: "activity", label: "Activity" },
] as const;

function asClaims(input: Record<string, unknown>[] | null | undefined): Claim[] {
  return (input || []).map((item) => ({
    claim: typeof item.claim === "string" ? item.claim : "",
    details: typeof item.details === "string" ? item.details : "",
    evidenceIds: Array.isArray(item.evidenceIds) ? item.evidenceIds.filter((value): value is string => typeof value === "string") : [],
    witnessIds: Array.isArray(item.witnessIds) ? item.witnessIds.filter((value): value is string => typeof value === "string") : [],
    responses: Array.isArray(item.responses)
      ? item.responses.flatMap((value) =>
          value && typeof value === "object" && typeof value.response === "string"
            ? [
                {
                  response: value.response,
                  submittedBy: typeof value.submittedBy === "string" ? value.submittedBy : "Unknown",
                  submittedDate: typeof value.submittedDate === "string" ? value.submittedDate : new Date().toISOString(),
                },
              ]
            : [],
        )
      : [],
  }));
}

export function CaseDetailWorkspace({ detail }: CaseDetailWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("overview");
  const [claimantClaims, setClaimantClaims] = useState(asClaims(detail.case.claimantClaims));
  const [respondentClaims, setRespondentClaims] = useState(asClaims(detail.case.respondentClaims));
  const [hearingDate, setHearingDate] = useState("");
  const [arbitrator, setArbitrator] = useState(detail.case.arbitratorAssignedName || "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedLawyer =
    detail.role === "respondent"
      ? getLawyerById(detail.case.respondentLawyerKey || detail.conversation?.lawyerPersonality, "respondent")
      : getLawyerById(detail.case.claimantLawyerKey || detail.conversation?.lawyerPersonality, "claimant");

  async function post(path: string, body?: unknown) {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Request failed.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function patch(path: string, body: unknown) {
    setError(null);
    const response = await fetch(path, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message || "Request failed.");
      return false;
    }
    router.refresh();
    return true;
  }

  function renderClaims(kind: "claimant" | "respondent") {
    const claims = kind === "claimant" ? claimantClaims : respondentClaims;
    const setClaims = kind === "claimant" ? setClaimantClaims : setRespondentClaims;
    const canEdit = detail.role === kind;

    return (
      <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-ink">
            {kind === "claimant" ? "Claimant claims" : "Respondent defenses"}
          </h3>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setClaims([...claims, { claim: "", details: "", evidenceIds: [], witnessIds: [], responses: [] }])}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Add entry
            </button>
          ) : null}
        </div>
        <div className="space-y-4">
          {claims.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">No entries yet.</div>
          ) : (
            claims.map((claim, index) => (
              <div key={`${kind}-${index}`} className="rounded-2xl bg-slate-50 p-4">
                {canEdit ? (
                  <>
                    <input
                      value={claim.claim}
                      onChange={(event) =>
                        setClaims(
                          claims.map((item, claimIndex) =>
                            claimIndex === index ? { ...item, claim: event.target.value } : item,
                          ),
                        )
                      }
                      placeholder="Claim or defense title"
                      className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    />
                    <textarea
                      value={claim.details || ""}
                      onChange={(event) =>
                        setClaims(
                          claims.map((item, claimIndex) =>
                            claimIndex === index ? { ...item, details: event.target.value } : item,
                          ),
                        )
                      }
                      rows={3}
                      className="mt-3 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                    />
                  </>
                ) : (
                  <>
                    <div className="font-semibold text-slate-900">{claim.claim}</div>
                    <div className="mt-2 text-sm leading-7 text-slate-600">{claim.details}</div>
                  </>
                )}
                {claim.responses?.length ? (
                  <div className="mt-4 space-y-2">
                    {claim.responses.map((response, responseIndex) => (
                      <div key={`${kind}-${index}-${responseIndex}`} className="rounded-2xl bg-white p-3 text-sm text-slate-700">
                        <div>{response.response}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.15em] text-slate-400">
                          {response.submittedBy} · {formatDateTime(response.submittedDate)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <Link href="/cases" className="font-medium text-signal hover:text-teal-800">
          Cases
        </Link>
        <span>/</span>
        <span>{detail.case.caseNumber}</span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{detail.roleLabel}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{detail.case.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--ink-soft)]">
            {detail.case.description || "No case description has been added yet."}
          </p>
        </div>
        <div role="tablist" aria-label="Case workspace sections" className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              role="tab"
              id={`tab-${tab.key}`}
              aria-selected={activeTab === tab.key}
              aria-controls={`panel-${tab.key}`}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key ? "bg-ink text-white" : "border border-slate-300 text-slate-700 hover:border-slate-400"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {activeTab === "overview" ? (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ["Status", detail.case.status.replaceAll("_", " ")],
                ["Priority", detail.case.priority],
                ["Category", detail.case.category || "Not set"],
                ["Claim amount", formatCurrency(detail.case.claimAmount, detail.case.currency)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
                  <div className="mt-2 text-sm font-semibold capitalize text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Case progress</div>
              <div className="mt-4 space-y-3">
                {detail.progressStages.map((stage) => (
                  <div
                    key={stage.key}
                    className={`rounded-2xl border px-4 py-3 text-sm ${
                      stage.active
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {stage.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Lawyer</div>
              {selectedLawyer ? (
                <div className="mt-3">
                  <div className="text-xl font-semibold text-ink">{selectedLawyer.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedLawyer.style}</div>
                </div>
              ) : detail.role === "claimant" || detail.role === "respondent" ? (
                <Link
                  href={`/cases/${detail.case.id}/select-lawyer` as Route}
                  className="mt-3 inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Choose lawyer
                </Link>
              ) : (
                <div className="mt-3 text-sm text-slate-600">No lawyer selected.</div>
              )}
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Case actions</div>
              <div className="mt-4 space-y-3">
                {detail.role === "claimant" ? (
                  <button
                    type="button"
                    onClick={() => startTransition(() => void post(`/api/cases/${detail.case.id}/notify`))}
                    className="w-full rounded-2xl bg-ink px-4 py-3 text-left text-sm font-semibold text-white disabled:opacity-60"
                    disabled={isPending}
                  >
                    Notify respondent
                  </button>
                ) : null}
                <Link href={`/cases/${detail.case.id}/audit` as Route} className="block rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-400">
                  Request audit
                </Link>
                <Link href={`/cases/${detail.case.id}/arbitration` as Route} className="block rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-400">
                  Request arbitration
                </Link>
                <Link href={`/cases/${detail.case.id}/judgement` as Route} className="block rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:border-slate-400">
                  Request judgement
                </Link>
              </div>
            </div>

            {(detail.role === "moderator" || detail.role === "admin") ? (
              <div className="rounded-[28px] border border-slate-200 bg-white p-6">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Hearing</div>
                <div className="mt-4 space-y-3">
                  <input
                    type="datetime-local"
                    value={hearingDate}
                    onChange={(event) => setHearingDate(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
                  />
                  <input
                    value={arbitrator}
                    onChange={(event) => setArbitrator(event.target.value)}
                    placeholder="Arbitrator name"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() =>
                        void post(`/api/cases/${detail.case.id}/hearing`, {
                          hearingDate,
                          arbitrator,
                        }),
                      )
                    }
                    className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={isPending}
                  >
                    Schedule hearing
                  </button>
                </div>
              </div>
            ) : null}

            {selectedLawyer && (detail.role === "claimant" || detail.role === "respondent") ? (
              <LawyerChatPanel
                caseId={detail.case.id}
                canUseChat
                initialConversation={detail.conversation}
              />
            ) : null}
          </section>
        </div>
      ) : null}

      {activeTab === "claims" ? (
        <div id="panel-claims" role="tabpanel" aria-labelledby="tab-claims" className="space-y-6">
          {renderClaims("claimant")}
          {renderClaims("respondent")}
          {detail.role !== "moderator" && detail.role !== "admin" ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Save claims</div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    startTransition(() =>
                      void patch(`/api/cases/${detail.case.id}/claims`, {
                        claimantClaims,
                        respondentClaims,
                      }),
                    )
                  }
                  className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
                >
                  Save claims
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "evidence" ? (
        <div id="panel-evidence" role="tabpanel" aria-labelledby="tab-evidence">
        <CaseWorkspace
          caseId={detail.case.id}
          roleLabel={detail.roleLabel}
          canContribute={detail.role !== "moderator" && detail.role !== "admin"}
          evidence={detail.evidence}
          witnesses={detail.witnesses}
          consultants={detail.consultants}
          expertiseRequests={detail.expertiseRequests}
          messages={detail.messages}
          initialSection="evidence"
          hideSectionNav
        />
        </div>
      ) : null}

      {activeTab === "witnesses" ? (
        <div id="panel-witnesses" role="tabpanel" aria-labelledby="tab-witnesses">
        <CaseWorkspace
          caseId={detail.case.id}
          roleLabel={detail.roleLabel}
          canContribute={detail.role !== "moderator" && detail.role !== "admin"}
          evidence={detail.evidence}
          witnesses={detail.witnesses}
          consultants={detail.consultants}
          expertiseRequests={detail.expertiseRequests}
          messages={detail.messages}
          initialSection="witnesses"
          hideSectionNav
        />
        </div>
      ) : null}

      {activeTab === "consultants" ? (
        <div id="panel-consultants" role="tabpanel" aria-labelledby="tab-consultants">
        <CaseWorkspace
          caseId={detail.case.id}
          roleLabel={detail.roleLabel}
          canContribute={detail.role !== "moderator" && detail.role !== "admin"}
          evidence={detail.evidence}
          witnesses={detail.witnesses}
          consultants={detail.consultants}
          expertiseRequests={detail.expertiseRequests}
          messages={detail.messages}
          initialSection="consultants"
          hideSectionNav
        />
        </div>
      ) : null}

      {activeTab === "expertise" ? (
        <div id="panel-expertise" role="tabpanel" aria-labelledby="tab-expertise">
        <CaseWorkspace
          caseId={detail.case.id}
          roleLabel={detail.roleLabel}
          canContribute={detail.role !== "moderator" && detail.role !== "admin"}
          evidence={detail.evidence}
          witnesses={detail.witnesses}
          consultants={detail.consultants}
          expertiseRequests={detail.expertiseRequests}
          messages={detail.messages}
          initialSection="expertise"
          hideSectionNav
        />
        </div>
      ) : null}

      {activeTab === "todo" ? (
        <section id="panel-todo" role="tabpanel" aria-labelledby="tab-todo" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">To-do</div>
          <div className="mt-4 space-y-3">
            {detail.todoItems.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                No outstanding actions detected.
              </div>
            ) : (
              detail.todoItems.map((item) => (
                <div key={item.key} className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  {item.label}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <section id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Activity timeline</div>
          <div className="mt-4 space-y-3">
            {detail.activities.map((activity) => (
              <div key={String(activity.id)} className="rounded-2xl bg-slate-50 p-4">
                <div className="font-semibold text-slate-900">{String(activity.title || "Activity")}</div>
                <div className="mt-1 text-sm text-slate-600">{String(activity.description || activity.type || "")}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.15em] text-slate-400">
                  {formatDateTime(String(activity.createdAt || ""))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
