"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { CaseWorkspace } from "@/components/case-workspace";
import { LawyerChatPanel } from "@/components/lawyer-chat-panel";
import { AuditPanel } from "@/components/audit-panel";
import { ArbitrationPanel } from "@/components/arbitration-panel";
import { HearingScheduler } from "@/components/hearing-scheduler";
import { ExistingHearings } from "./existing-hearings";
import { AITestingInterface } from "@/components/ai-testing-interface";
import { VoiceTestPanel } from "@/components/voice-test-panel";
import { JudgementPanel } from "@/components/judgement-panel";
import { getLawyerById } from "@/lib/lawyers";
import { formatCurrency, formatDateTime } from "@/server/format";
import { resolveCaseClaimant, resolveCaseRespondent, type KycStatus } from "@/server/identity/resolve";

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

type AuditRecord = {
  id: string;
  title: string | null;
  requestedAt: string | Date;
  snapshotJson: Record<string, unknown>;
  auditJson: Record<string, unknown>;
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
      claimantPhone: string | null;
      claimantNameVerified?: string | null;
      claimantKycVerificationId?: string | null;
      respondentName: string | null;
      respondentEmail: string | null;
      respondentPhone: string | null;
      respondentNameAlleged?: string | null;
      respondentNameVerified?: string | null;
      respondentKycVerificationId?: string | null;
      claimantClaims: Record<string, unknown>[] | null;
      respondentClaims: Record<string, unknown>[] | null;
      claimantLawyerKey: string | null;
      respondentLawyerKey?: string | null;
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
    audits: AuditRecord[];
    hearings: WorkspaceRecord[];
    conversation: {
      lawyerPersonality?: string | null;
      contextSummary?: string | null;
      messagesJson?: Record<string, unknown>[] | null;
    } | null;
    todoItems: Array<{ key: string; label: string }>;
    progressStages: Array<{ key: string; label: string; active: boolean }>;
    claimantKyc?: {
      status: KycStatus | null;
      verifiedAt: Date | string | null;
      verifiedFirstName?: string | null;
      verifiedLastName?: string | null;
    } | null;
    respondentKyc?: {
      status: KycStatus | null;
      verifiedAt: Date | string | null;
      verifiedFirstName?: string | null;
      verifiedLastName?: string | null;
    } | null;
  };
  userRole?: string;
  user?: any;
};

const tabs = [
  { key: "overview", label: <span className="font-bold">Overview</span> },
  { key: "claims", label: "Claims" },
  { key: "evidence", label: "Evidence" },
  { key: "witnesses", label: "Witnesses" },
  { key: "consultants", label: "Consultants" },
  { key: "expertise", label: "Expertise" },
  { key: "audit", label: "Audit" },
  { key: "arbitration", label: "Arbitration" },
  { key: "hearing", label: "Hearing" },
  { key: "judgement", label: "Judgement" },
  { key: "lawyer-chat", label: "Lawyer chat" },
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

export function CaseDetailWorkspace({ detail, userRole, user }: CaseDetailWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("overview");
  const [claimantClaims, setClaimantClaims] = useState(asClaims(detail.case.claimantClaims));
  const [respondentClaims, setRespondentClaims] = useState(asClaims(detail.case.respondentClaims));
  const [arbitrator, setArbitrator] = useState(detail.case.arbitratorAssignedName || "");
  const [error, setError] = useState<string | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [contactsSaving, setContactsSaving] = useState(false);
  const [notificationSent, setNotificationSent] = useState(false);
  const [claimantName, setClaimantName] = useState(detail.case.claimantName || "");
  const [claimantEmail, setClaimantEmail] = useState(detail.case.claimantEmail || "");
  const [claimantPhone, setClaimantPhone] = useState(detail.case.claimantPhone || "");
  const [respondentName, setRespondentName] = useState(detail.case.respondentName || "");
  const [respondentEmail, setRespondentEmail] = useState(detail.case.respondentEmail || "");
  const [respondentPhone, setRespondentPhone] = useState(detail.case.respondentPhone || "");

  
  // Calculate selectedLawyer before todo items to avoid initialization error
  const selectedLawyer =
    detail.role === "respondent"
      ? getLawyerById(detail.case.respondentLawyerKey || detail.conversation?.lawyerPersonality, "respondent")
      : getLawyerById(detail.case.claimantLawyerKey || detail.conversation?.lawyerPersonality, "claimant");

  // Calculate todo items dynamically from database data
  const [todoItems, setTodoItems] = useState([
    { key: "lawyer", label: "Lawyer selection", completed: selectedLawyer !== null },
    { key: "claims", label: "Submit claim(s)", completed: (detail.case.claimantClaims?.length || 0) + (detail.case.respondentClaims?.length || 0) > 0 },
    { key: "evidence", label: "Submit evidence", completed: detail.evidence.length > 0 },
    { key: "audit", label: "Request audit", completed: detail.audits.length > 0 },
    { key: "notify", label: "Notify respondent", completed: detail.activities.some(activity => activity.title === "Defendant notified") },
    { key: "witnesses", label: "Add witnesses", completed: detail.witnesses.length > 0 },
    { key: "consultants", label: "Add consultants", completed: detail.consultants.length > 0 },
    { key: "expertise", label: "Add expertise", completed: detail.expertiseRequests.length > 0 },
    { key: "hearing", label: "Schedule hearing", completed: detail.hearings.length > 0 },
    { key: "hearing-complete", label: "Hearing", completed: detail.hearings.some(h => h.status === "completed") },
    { key: "arbitration", label: "Request arbitration", completed: !!(detail.case as any).arbitrationProposalJson },
    { key: "judgement", label: "Request judgement", completed: !!(detail.case as any).judgementJson },
  ]);

  // Type for interactive todo items
  type InteractiveTodoItem = {
    key: string;
    label: string;
    completed: boolean;
  };

  // Calculate tab counts
  const tabCounts = {
    claims: (detail.case.claimantClaims?.length || 0) + (detail.case.respondentClaims?.length || 0),
    evidence: detail.evidence.length,
    witnesses: detail.witnesses.length,
    consultants: detail.consultants.length,
    expertise: detail.expertiseRequests.length
  };

  // Store original values to track changes
  const originalContacts = {
    claimantName: detail.case.claimantName || "",
    claimantEmail: detail.case.claimantEmail || "",
    claimantPhone: detail.case.claimantPhone || "",
    respondentName: detail.case.respondentName || "",
    respondentEmail: detail.case.respondentEmail || "",
    respondentPhone: detail.case.respondentPhone || "",
  };
  
  // Check if any contact fields have changed
  const contactsHaveChanged = 
    claimantName !== originalContacts.claimantName ||
    claimantEmail !== originalContacts.claimantEmail ||
    claimantPhone !== originalContacts.claimantPhone ||
    respondentName !== originalContacts.respondentName ||
    respondentEmail !== originalContacts.respondentEmail ||
    respondentPhone !== originalContacts.respondentPhone;

  // Update todo items when database data changes
  React.useEffect(() => {
    // Check if respondent was notified via activities
    const respondentNotified = detail.activities.some(activity => 
      activity.title === "Defendant notified"
    );
    
    // Check hearing status from hearings data
    const hearingScheduled = detail.hearings.length > 0;
    const hearingCompleted = detail.hearings.some(h => h.status === "completed");
    
    const freshTodoItems: InteractiveTodoItem[] = [
      { key: "lawyer", label: "Lawyer selection", completed: selectedLawyer !== null },
      { key: "claims", label: "Submit claim(s)", completed: (detail.case.claimantClaims?.length || 0) + (detail.case.respondentClaims?.length || 0) > 0 },
      { key: "evidence", label: "Submit evidence", completed: detail.evidence.length > 0 },
      { key: "audit", label: "Request audit", completed: detail.audits.length > 0 },
      { key: "notify", label: "Notify respondent", completed: respondentNotified },
      { key: "witnesses", label: "Add witnesses", completed: detail.witnesses.length > 0 },
      { key: "consultants", label: "Add consultants", completed: detail.consultants.length > 0 },
      { key: "expertise", label: "Add expertise", completed: detail.expertiseRequests.length > 0 },
      { key: "hearing", label: "Schedule hearing", completed: hearingScheduled },
      { key: "hearing-complete", label: "Hearing", completed: hearingCompleted },
      { key: "arbitration", label: "Request arbitration", completed: !!(detail.case as any).arbitrationProposalJson },
      { key: "judgement", label: "Request judgement", completed: !!(detail.case as any).judgementJson },
      { key: "appeal", label: "Request appeal", completed: false }, // TODO: Parked for future implementation
      { key: "verdict", label: "Request final verdict", completed: false }, // TODO: Parked for future implementation
    ];
    
    setTodoItems(currentItems => 
      currentItems.map(item => {
        const freshItem = freshTodoItems.find(f => f.key === item.key);
        return freshItem ? { ...item, completed: !!freshItem.completed } : item;
      })
    );
  }, [detail, selectedLawyer]);

  
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

  async function saveContacts() {
    setContactsError(null);
    setContactsSaving(true);
    try {
      const response = await fetch(`/api/cases/${detail.case.id}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimantName,
          claimantEmail,
          claimantPhone: claimantPhone.trim() ? claimantPhone : null,
          respondentName,
          respondentEmail,
          respondentPhone: respondentPhone.trim() ? respondentPhone : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setContactsError(result.error?.message || "Failed to update contacts.");
        return;
      }
      router.refresh();
    } finally {
      setContactsSaving(false);
    }
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
                <div className="flex items-start justify-between">
                  <div className="flex-1">
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
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => setClaims(claims.filter((_, claimIndex) => claimIndex !== index))}
                      className="ml-3 rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-100"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
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
        {detail.role === "respondent" && !user?.kycVerified ? (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <svg className="h-5 w-5 shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div className="flex-1 min-w-[16rem]">
              <p className="font-medium">Identity verification is required before you can join your hearing.</p>
              <p className="mt-0.5 text-blue-800">You can continue working on the case now and verify any time.</p>
            </div>
            <Link
              href={`/verify/start?returnTo=/cases/${detail.case.id}` as Route}
              className="whitespace-nowrap rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Verify now
            </Link>
          </div>
        ) : null}
        {(() => {
          const normalizeKyc = (k: CaseDetailWorkspaceProps["detail"]["claimantKyc"]) =>
            k ? { ...k, verifiedAt: k.verifiedAt ? new Date(k.verifiedAt) : null } : null;
          const claimantIdentity = resolveCaseClaimant(detail.case, normalizeKyc(detail.claimantKyc));
          const respondentIdentity = resolveCaseRespondent(detail.case, normalizeKyc(detail.respondentKyc));
          const banners: { who: "claimant" | "respondent"; alleged: string; verified: string }[] = [];
          if (claimantIdentity.diverges && claimantIdentity.verified && claimantIdentity.alleged) {
            banners.push({ who: "claimant", alleged: claimantIdentity.alleged, verified: claimantIdentity.verified });
          }
          if (respondentIdentity.diverges && respondentIdentity.verified && respondentIdentity.alleged) {
            banners.push({ who: "respondent", alleged: respondentIdentity.alleged, verified: respondentIdentity.verified });
          }
          if (banners.length === 0) return null;
          return (
            <div className="space-y-2">
              {banners.map((b) => (
                <div
                  key={b.who}
                  className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
                >
                  <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3h.008v.008H12v-.008Zm9.75-2.25c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9Z" />
                  </svg>
                  <div>
                    <p className="font-medium capitalize">Identity drift: {b.who}</p>
                    <p className="mt-0.5">
                      Filed as <strong>{b.alleged}</strong>, verified as <strong>{b.verified}</strong>.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{detail.roleLabel}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{detail.case.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--ink-soft)]">
            {detail.case.description || "No case description has been added yet."}
          </p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div role="tablist" aria-label="Case workspace sections" className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
            <React.Fragment key={tab.key}>
              {tab.key === "audit" && <div className="w-full"></div>}
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`panel-${tab.key}`}
                className={`relative rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.key 
                    ? "bg-ink text-white border-2 border-ink" 
                    : "border border-slate-300 text-slate-700 hover:border-slate-400"
                } ${tab.key === "overview" ? "font-bold border-2 border-ink" : ""}`}
              >
                {tab.label}
                {tabCounts[tab.key as keyof typeof tabCounts] > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    {tabCounts[tab.key as keyof typeof tabCounts]}
                  </span>
                )}
              </button>
            </React.Fragment>
          ))}
          </div>
          
          {/* Admin Edit Button */}
          {userRole === "admin" || userRole === "moderator" ? (
            <Link
              href={`/cases/${detail.case.id}/edit` as Route}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 whitespace-nowrap"
            >
              Edit case
            </Link>
          ) : null}
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

            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Contacts</div>
              {detail.role === "claimant" || userRole === "admin" ? (
                <div className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant</div>
                      <div className="mt-3 space-y-2">
                        <input
                          value={claimantName}
                          onChange={(event) => setClaimantName(event.target.value)}
                          placeholder="Name"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                        <input
                          value={claimantEmail}
                          onChange={(event) => setClaimantEmail(event.target.value)}
                          placeholder="Email"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                        <input
                          value={claimantPhone}
                          onChange={(event) => setClaimantPhone(event.target.value)}
                          placeholder="Phone (optional)"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent</div>
                      <div className="mt-3 space-y-2">
                        <input
                          value={respondentName}
                          onChange={(event) => setRespondentName(event.target.value)}
                          placeholder="Name"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                        <input
                          value={respondentEmail}
                          onChange={(event) => setRespondentEmail(event.target.value)}
                          placeholder="Email"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                        <input
                          value={respondentPhone}
                          onChange={(event) => setRespondentPhone(event.target.value)}
                          placeholder="Phone (optional)"
                          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {contactsError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {contactsError}
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        disabled={contactsSaving || !contactsHaveChanged}
                        onClick={() => void saveContacts()}
                        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                      >
                        {contactsSaving ? "Saving..." : "Save contacts"}
                      </button>
                      {detail.role === "claimant" && detail.case.respondentEmail?.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            startTransition(async () => {
                              try {
                                await post(`/api/cases/${detail.case.id}/notify`);
                                setNotificationSent(true);
                              } catch (error) {
                                // Error handling is already done in the post function
                              }
                            });
                          }}
                          disabled={isPending || notificationSent}
                          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {isPending ? "Sending..." : notificationSent ? "Respondent notified" : "Notify respondent"}
                        </button>
                      ) : null}
                    </div>
                    <div className="text-sm text-slate-500">
                      Updating respondent email controls where &ldquo;Notify respondent&rdquo; is sent.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{detail.case.claimantName || "-"}</div>
                    <div className="mt-1 text-sm text-slate-600">{detail.case.claimantEmail || "-"}</div>
                    <div className="mt-1 text-sm text-slate-600">{detail.case.claimantPhone || "-"}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{detail.case.respondentName || "-"}</div>
                    <div className="mt-1 text-sm text-slate-600">{detail.case.respondentEmail || "-"}</div>
                    <div className="mt-1 text-sm text-slate-600">{detail.case.respondentPhone || "-"}</div>
                  </div>
                </div>
              )}
            </div>

            
                      </section>

          <section className="space-y-6">
            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Case Progress</div>
              <div className="mt-4 space-y-3">
                {todoItems.map((item) => (
                  <div 
                    key={item.key} 
                    className={`rounded-2xl p-4 text-sm transition-all duration-300 ${
                      item.completed 
                        ? 'bg-gradient-to-r from-signal/10 to-teal-50 border border-signal/30 text-slate-800 shadow-sm' 
                        : 'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`font-medium ${item.completed ? 'text-slate-900' : 'text-slate-600'}`}>
                        {item.label}
                      </div>
                      {item.completed && (
                        <div className="flex-shrink-0">
                          <span className="inline-flex items-center rounded-full bg-signal/20 px-2.5 py-0.5 text-xs font-medium text-signal">
                            Completed
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Activity timeline</div>
              <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
                {detail.activities.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    No activity recorded yet.
                  </div>
                ) : (
                  detail.activities.map((activity) => (
                    <div key={String(activity.id)} className="rounded-2xl bg-slate-50 p-4">
                      <div className="font-semibold text-slate-900">{String(activity.title || "Activity")}</div>
                      <div className="mt-1 text-sm text-slate-600">{String(activity.description || activity.type || "")}</div>
                      <div className="mt-2 text-xs uppercase tracking-[0.15em] text-slate-400">
                        {formatDateTime(String(activity.createdAt || ""))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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

      {activeTab === "audit" ? (
        <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <AuditPanel caseId={detail.case.id} audits={detail.audits || []} userRole={userRole} />
        </div>
      ) : null}

      {activeTab === "arbitration" ? (
        <div id="panel-arbitration" role="tabpanel" aria-labelledby="tab-arbitration" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <ArbitrationPanel
            caseId={detail.case.id}
            status={detail.case.status}
            proposal={(detail.case as any).arbitrationProposalJson}
            finalDecision={detail.case.finalDecision}
          />
        </div>
      ) : null}

      {activeTab === "hearing" ? (
        <div id="panel-hearing" role="tabpanel" aria-labelledby="tab-hearing" className="space-y-6">
          {/* Hearing Room Placeholder */}
          <div className="rounded-lg border border-slate-200 bg-white p-8">
            <div className="space-y-6">
              {/* Header */}
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-ink">Court Hearing Room</h2>
                <p className="mt-2 text-slate-600">Case: {detail.case.title}</p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800">
                  <div className="h-2 w-2 rounded-full bg-amber-600 animate-pulse"></div>
                  Session Not Started
                </div>
              </div>

              {/* Participants Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                {/* Judge */}
                <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
                  <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-8 w-8 text-slate-500">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-ink">Judge</h3>
                  <p className="text-sm text-slate-500 mt-1">Awaiting</p>
                </div>

                {/* Claimant */}
                <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
                  <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-blue-200 flex items-center justify-center">
                    <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-ink">Claimant</h3>
                  <p className="text-sm text-slate-500 mt-1">{detail.case.claimantName}</p>
                </div>

                {/* Defendant */}
                <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
                  <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-red-200 flex items-center justify-center">
                    <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-ink">Defendant</h3>
                  <p className="text-sm text-slate-500 mt-1">{detail.case.respondentName}</p>
                </div>

                {/* Lawyers */}
                <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
                  <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-green-200 flex items-center justify-center">
                    <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="font-medium text-ink">Legal Counsel</h3>
                  <p className="text-sm text-slate-500 mt-1">Both Parties</p>
                </div>
              </div>
            </div>
          </div>

          {/* Existing Hearings */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6">
            <ExistingHearings
              caseId={detail.case.id}
              caseTitle={detail.case.title}
              viewerRole={detail.role}
              viewerKycVerified={Boolean(user?.kycVerified)}
            />
          </div>

          {/* Hearing Scheduler */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6">
            <HearingScheduler caseId={detail.case.id} caseTitle={detail.case.title} />
          </div>

          {/* AI Testing Interface */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6">
            <AITestingInterface caseId={detail.case.id} caseTitle={detail.case.title} />
          </div>

          {/* Voice Test Panel */}
          <div className="rounded-[28px] border border-slate-200 bg-white p-6">
            <VoiceTestPanel caseId={detail.case.id} caseTitle={detail.case.title} />
          </div>
        </div>
      ) : null}

      {activeTab === "judgement" ? (
        <div id="panel-judgement" role="tabpanel" aria-labelledby="tab-judgement" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <JudgementPanel
            caseId={detail.case.id}
            canModerate={userRole === "moderator" || userRole === "admin"}
            judgement={(detail.case as any).judgementJson}
            finalDecision={detail.case.finalDecision}
          />
        </div>
      ) : null}

      {activeTab === "lawyer-chat" ? (
        <div id="panel-lawyer-chat" role="tabpanel" aria-labelledby="tab-lawyer-chat" className="rounded-[28px] border border-slate-200 bg-white p-6">
          {selectedLawyer && (detail.role === "claimant" || detail.role === "respondent") ? (
            <LawyerChatPanel
              caseId={detail.case.id}
              canUseChat
              lawyerName={selectedLawyer.name}
              initialConversation={detail.conversation}
            />
          ) : (
            <div className="text-center text-sm text-slate-600">
              {selectedLawyer ? "Lawyer chat not available for your role" : "Select a lawyer to enable chat"}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
