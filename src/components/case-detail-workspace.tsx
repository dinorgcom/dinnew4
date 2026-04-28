"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { CaseWorkspace } from "@/components/case-workspace";
import { LawyerChatPanel } from "@/components/lawyer-chat-panel";
import { AuditPanel } from "@/components/audit-panel";
import { ArbitrationPanel } from "@/components/arbitration-panel";
import { HearingScheduler } from "@/components/hearing-scheduler";
import { HearingProposalPanel } from "@/components/hearing-proposal-panel";
import { AppealPanel } from "@/components/appeal-panel";
import { ACTION_COSTS } from "@/server/billing/config";
import { ExistingHearings } from "./existing-hearings";
import { JudgementPanel } from "@/components/judgement-panel";
import { LivekitAnamPanel } from "@/components/livekit-anam-panel";
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
      respondentLinkedAt?: string | Date | null;
      respondentUserId?: string | null;
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
    respondentNotified: boolean;
    impersonation?: {
      role: "claimant" | "respondent";
      targetEmail: string;
      targetName: string | null;
    } | null;
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
    tokenCosts?: {
      claimant: number;
      respondent: number;
      other: number;
      total: number;
    };
  };
  userRole?: string;
  user?: any;
};

const tabs = [
  { key: "overview", label: "Overview" },
  { key: "progress", label: "Progress" },
  { key: "claimant", label: "Claimant" },
  { key: "respondent", label: "Respondent" },
  { key: "activity", label: "Activity" },
  { key: "todo", label: "To do" },
  { key: "claims", label: "Claims" },
  { key: "evidence", label: "Evidence" },
  { key: "witnesses", label: "Witnesses" },
  { key: "consultants", label: "Consultants" },
  { key: "expertise", label: "Expertise" },
  { key: "hearing", label: "Hearing" },
  { key: "audit", label: "Audit" },
  { key: "arbitration", label: "Arbitration" },
  { key: "judgement", label: "Judgement" },
  { key: "appeal", label: "Appeal" },
  { key: "final-judgement", label: "Final judgement" },
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
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const requested = searchParams?.get("tab");
    return requested && tabs.some((t) => t.key === requested)
      ? (requested as (typeof tabs)[number]["key"])
      : "overview";
  })();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>(initialTab);

  useEffect(() => {
    const requested = searchParams?.get("tab");
    if (requested && tabs.some((t) => t.key === requested)) {
      setActiveTab(requested as (typeof tabs)[number]["key"]);
    }
  }, [searchParams]);
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

  const claimsSubmitted =
    (detail.case.claimantClaims?.length || 0) + (detail.case.respondentClaims?.length || 0) > 0;
  const respondentDefenceSubmitted = (detail.case.respondentClaims?.length || 0) > 0;
  const discoveryStarted =
    detail.evidence.length > 0
    || detail.witnesses.length > 0
    || detail.consultants.length > 0
    || detail.expertiseRequests.length > 0;
  const hearingCompleted = detail.hearings.some((h) => h.status === "completed");
  const auditRequested = detail.audits.length > 0;
  const arbitrationRequested = !!(detail.case as any).arbitrationProposalJson;
  const rulingIssued = !!(detail.case as any).judgementJson;
  const finalRulingIssued =
    detail.case.status === "resolved" || !!detail.case.finalDecision;

  const progressStages: Array<{ key: string; label: string; completed: boolean }> = [
    { key: "lawyer", label: "Lawyer selection", completed: selectedLawyer !== null },
    { key: "claims", label: "Submit claims", completed: claimsSubmitted },
    { key: "notify", label: "Notify the opponent", completed: detail.respondentNotified },
    { key: "defence", label: "Opponents defence", completed: respondentDefenceSubmitted },
    { key: "discovery", label: "Discovery phase", completed: discoveryStarted },
    { key: "hearing", label: "Hearing", completed: hearingCompleted },
    { key: "audit", label: "Audit", completed: auditRequested },
    { key: "arbitration", label: "Arbitration", completed: arbitrationRequested },
    { key: "ruling", label: "Ruling", completed: rulingIssued },
    { key: "appeal", label: "Appeal", completed: false },
    { key: "final", label: "Final Ruling", completed: finalRulingIssued },
  ];

  const firstPendingIndex = progressStages.findIndex((stage) => !stage.completed);
  const activeStageIndex = firstPendingIndex === -1 ? progressStages.length - 1 : firstPendingIndex;

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

  const showLawyerChat = detail.role === "claimant" || detail.role === "respondent";
  const respondentLinked = Boolean(
    detail.case.respondentLinkedAt || detail.case.respondentUserId,
  );

  return (
    <div className="lg:-m-6">
      <div
        className={`grid gap-6 ${
          showLawyerChat
            ? "lg:grid-cols-[200px_minmax(0,1fr)_360px]"
            : "lg:grid-cols-[200px_minmax(0,1fr)]"
        }`}
      >
        <aside className="lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto lg:px-2 lg:py-5">
          <div role="tablist" aria-label="Case workspace sections" className="flex flex-col gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`panel-${tab.key}`}
                className={`flex items-start justify-between rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                  activeTab === tab.key
                    ? "bg-ink text-white shadow"
                    : "border border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                } ${tab.key === "overview" ? "font-semibold" : ""}`}
              >
                <span className={tab.key === "overview" ? "line-clamp-2 text-left leading-snug" : "truncate"}>
                  {tab.key === "overview" ? detail.case.title : tab.label}
                </span>
                {tabCounts[tab.key as keyof typeof tabCounts] > 0 && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    activeTab === tab.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}>
                    {tabCounts[tab.key as keyof typeof tabCounts]}
                  </span>
                )}
              </button>
            ))}
            {detail.role === "moderator" ? (
              <Link
                href={`/cases/${detail.case.id}/edit` as Route}
                className="mt-3 block rounded-2xl border border-slate-300 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Edit case
              </Link>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0 space-y-6 lg:py-6">
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
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

      {activeTab === "overview" ? (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-6">
          <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{detail.roleLabel}</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{detail.case.title}</h1>
              {detail.case.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[color:var(--ink-soft)]">
                  {detail.case.description}
                </p>
              ) : null}
            </div>
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
          </section>
        </div>
      ) : null}

      {activeTab === "claimant" ? (
        <div id="panel-claimant" role="tabpanel" aria-labelledby="tab-claimant" className="rounded-[28px] border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Claimant</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {detail.case.claimantName || "-"}
            </h2>
          </div>
          {detail.role === "claimant" ? (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
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
              {contactsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {contactsError}
                </div>
              ) : null}
              <button
                type="button"
                disabled={contactsSaving || !contactsHaveChanged}
                onClick={() => void saveContacts()}
                className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {contactsSaving ? "Saving..." : "Save claimant details"}
              </button>
            </div>
          ) : (
            <dl className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</dt>
                <dd className="text-slate-700">{detail.case.claimantEmail || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Phone</dt>
                <dd className="text-slate-700">{detail.case.claimantPhone || "-"}</dd>
              </div>
            </dl>
          )}
        </div>
      ) : null}

      {activeTab === "respondent" ? (
        <div id="panel-respondent" role="tabpanel" aria-labelledby="tab-respondent" className="rounded-[28px] border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Respondent</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {detail.case.respondentName || "-"}
            </h2>
            {respondentLinked ? (
              <p className="mt-1 text-xs text-emerald-700">
                Respondent has joined the case and now manages their own details.
              </p>
            ) : null}
          </div>
          {(detail.role === "respondent" || (detail.role === "claimant" && !respondentLinked)) ? (
            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
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
              {contactsError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {contactsError}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={contactsSaving || !contactsHaveChanged}
                  onClick={() => void saveContacts()}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {contactsSaving ? "Saving..." : "Save respondent details"}
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
                    className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isPending ? "Sending..." : notificationSent ? "Respondent notified" : "Notify respondent"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <dl className="grid gap-2 rounded-2xl bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</dt>
                <dd className="text-slate-700">{detail.case.respondentEmail || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Phone</dt>
                <dd className="text-slate-700">{detail.case.respondentPhone || "-"}</dd>
              </div>
            </dl>
          )}
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Activity timeline</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Recent activity</h2>
          <div className="mt-4 space-y-3 max-h-[600px] overflow-y-auto">
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
      ) : null}

      {activeTab === "todo" ? (
        <div id="panel-todo" role="tabpanel" aria-labelledby="tab-todo" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">My to do</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Open points</h2>
          <p className="mt-2 text-sm text-slate-600">
            Items waiting for your decision or input on this case.
          </p>
          {(() => {
            const items: Array<{ key: string; label: string; href?: string; tab?: string }> = [];
            const role = detail.role;
            const isParty = role === "claimant" || role === "respondent";

            if (isParty && !selectedLawyer) {
              items.push({
                key: "choose-lawyer",
                label: "Choose your lawyer",
                href: `/cases/${detail.case.id}/select-lawyer`,
              });
            }
            if (isParty && !user?.kycVerified) {
              items.push({
                key: "verify-id",
                label: "Verify your identity (KYC)",
                href: `/verify/start?returnTo=/cases/${detail.case.id}`,
              });
            }
            if (role === "claimant" && (!detail.case.claimantClaims || detail.case.claimantClaims.length === 0)) {
              items.push({ key: "submit-claims", label: "Submit your claims", tab: "claims" });
            }
            if (role === "respondent" && (!detail.case.respondentClaims || detail.case.respondentClaims.length === 0)) {
              items.push({ key: "submit-defence", label: "Submit your defence claims", tab: "claims" });
            }
            if (role === "claimant" && !detail.respondentNotified) {
              items.push({ key: "notify-respondent", label: "Notify the respondent", tab: "respondent" });
            }
            // Evidence review items: where the opposing party hasn't reviewed yet and the user is the opposing party
            const opposing = role === "claimant" ? "respondent" : role === "respondent" ? "claimant" : null;
            if (opposing) {
              for (const e of detail.evidence) {
                const submittedBy = String((e as any).submittedBy || "").toLowerCase();
                const state = String((e as any).reviewState || "pending").toLowerCase();
                const isOpposing =
                  (role === "claimant" && submittedBy === "respondent") ||
                  (role === "respondent" && submittedBy === "claimant");
                if (isOpposing && state === "pending") {
                  items.push({
                    key: `review-evidence-${e.id}`,
                    label: `Review evidence: ${String((e as any).title || "Untitled")}`,
                    tab: "evidence",
                  });
                }
              }
            }
            // Arbitration response pending
            const claimantArb = (detail.case as any).arbitrationClaimantResponse;
            const respondentArb = (detail.case as any).arbitrationRespondentResponse;
            const proposal = (detail.case as any).arbitrationProposalJson;
            if (proposal) {
              if (role === "claimant" && !claimantArb) {
                items.push({ key: "respond-arb-c", label: "Respond to the arbitration proposal", tab: "arbitration" });
              }
              if (role === "respondent" && !respondentArb) {
                items.push({ key: "respond-arb-r", label: "Respond to the arbitration proposal", tab: "arbitration" });
              }
            }

            if (items.length === 0) {
              return (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  Nothing waiting on you right now.
                </div>
              );
            }

            return (
              <ul className="mt-4 space-y-2">
                {items.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-medium text-amber-900">{item.label}</div>
                    {item.tab ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab(item.tab as (typeof tabs)[number]["key"])}
                        className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Open
                      </button>
                    ) : item.href ? (
                      <Link
                        href={item.href as Route}
                        className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            );
          })()}
        </div>
      ) : null}

      {activeTab === "appeal" ? (
        <div id="panel-appeal" role="tabpanel" aria-labelledby="tab-appeal" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Appeal</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Request an appeal</h2>
          <p className="mt-2 text-sm text-slate-600">
            If you disagree with the judgement, you may request an appeal reviewed by a panel of jurors.
            Each juror costs <strong>{ACTION_COSTS.appeal_request} tokens</strong>. Choose 1, 3, 5, or 7 jurors (max 7).
          </p>
          <AppealPanel caseId={detail.case.id} canRequest={detail.role === "claimant" || detail.role === "respondent"} />
        </div>
      ) : null}

      {activeTab === "final-judgement" ? (
        <div id="panel-final-judgement" role="tabpanel" aria-labelledby="tab-final-judgement" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final judgement</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">After appeal</h2>
          <p className="mt-2 text-sm text-slate-600">
            The final, binding judgement issued after appeal review. This decision closes the case.
          </p>
          {(detail.case as any).finalAppealJudgement ? (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
              {String((detail.case as any).finalAppealJudgement)}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              No final judgement has been issued yet.
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "progress" ? (
        <div id="panel-progress" role="tabpanel" aria-labelledby="tab-progress" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Case progress</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Workflow stages</h2>
          <p className="mt-2 text-sm text-slate-600">
            Steps of the arbitration process. Completed stages are marked; the next pending stage is highlighted.
          </p>
          <ol className="mt-6 space-y-4">
            {progressStages.map((stage, index) => {
              const isActive = index === activeStageIndex && !stage.completed;
              const isLast = index === progressStages.length - 1;
              return (
                <li key={stage.key} className="relative flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                        stage.completed
                          ? "bg-signal text-white"
                          : isActive
                            ? "bg-ink text-white"
                            : "bg-slate-100 text-slate-500"
                      }`}
                      aria-hidden="true"
                    >
                      {stage.completed ? (
                        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8 7 12 13 4" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    {!isLast ? (
                      <span
                        className={`mt-1 h-full min-h-[1.25rem] w-px flex-1 ${
                          progressStages[index + 1].completed || index < activeStageIndex
                            ? "bg-signal"
                            : "bg-slate-200"
                        }`}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  <div className="pb-3">
                    <div
                      className={`text-sm font-semibold ${
                        stage.completed
                          ? "text-slate-900"
                          : isActive
                            ? "text-ink"
                            : "text-slate-500"
                      }`}
                    >
                      {stage.label}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
                      {stage.completed ? "Completed" : isActive ? "Current step" : "Pending"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
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
            caseRole={detail.role}
            roleLabel={detail.roleLabel}
            canContribute={detail.role !== "moderator" && detail.role !== "admin"}
            evidence={detail.evidence}
            witnesses={detail.witnesses}
            consultants={detail.consultants}
            expertiseRequests={detail.expertiseRequests}
            messages={detail.messages}
            initialSection="evidence"
            hideSectionNav
            userRole={userRole}
          />
        </div>
      ) : null}

      {activeTab === "witnesses" ? (
        <div id="panel-witnesses" role="tabpanel" aria-labelledby="tab-witnesses">
          <CaseWorkspace
            caseId={detail.case.id}
            caseRole={detail.role}
            roleLabel={detail.roleLabel}
            canContribute={detail.role !== "moderator" && detail.role !== "admin"}
            evidence={detail.evidence}
            witnesses={detail.witnesses}
            consultants={detail.consultants}
            expertiseRequests={detail.expertiseRequests}
            messages={detail.messages}
            initialSection="witnesses"
            hideSectionNav
            userRole={userRole}
          />
        </div>
      ) : null}

      {activeTab === "consultants" ? (
        <div id="panel-consultants" role="tabpanel" aria-labelledby="tab-consultants">
          <CaseWorkspace
            caseId={detail.case.id}
            caseRole={detail.role}
            roleLabel={detail.roleLabel}
            canContribute={detail.role !== "moderator" && detail.role !== "admin"}
            evidence={detail.evidence}
            witnesses={detail.witnesses}
            consultants={detail.consultants}
            expertiseRequests={detail.expertiseRequests}
            messages={detail.messages}
            initialSection="consultants"
            hideSectionNav
            userRole={userRole}
          />
        </div>
      ) : null}

      {activeTab === "expertise" ? (
        <div id="panel-expertise" role="tabpanel" aria-labelledby="tab-expertise">
          <CaseWorkspace
            caseId={detail.case.id}
            caseRole={detail.role}
            roleLabel={detail.roleLabel}
            canContribute={detail.role !== "moderator" && detail.role !== "admin"}
            evidence={detail.evidence}
            witnesses={detail.witnesses}
            consultants={detail.consultants}
            expertiseRequests={detail.expertiseRequests}
            messages={detail.messages}
            initialSection="expertise"
            hideSectionNav
            userRole={userRole}
          />
        </div>
      ) : null}

      {activeTab === "audit" ? (
        <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <AuditPanel caseId={detail.case.id} audits={detail.audits || []} userRole={detail.role} />
        </div>
      ) : null}

      {activeTab === "arbitration" ? (
        <div id="panel-arbitration" role="tabpanel" aria-labelledby="tab-arbitration" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <ArbitrationPanel
            caseId={detail.case.id}
            status={detail.case.status}
            proposal={(detail.case as any).arbitrationProposalJson}
            finalDecision={detail.case.finalDecision}
            arbitrationClaimantResponse={(detail.case as any).arbitrationClaimantResponse}
            arbitrationRespondentResponse={(detail.case as any).arbitrationRespondentResponse}
            claimantEmail={detail.case.claimantEmail}
            respondentEmail={detail.case.respondentEmail}
            user={user}
            tokenCosts={detail.tokenCosts}
          />
        </div>
      ) : null}

      {activeTab === "hearing" ? (
        <div id="panel-hearing" role="tabpanel" aria-labelledby="tab-hearing" className="space-y-6">
          {/* Discovery-gated AI 5-slot proposal + voting */}
          <HearingProposalPanel caseId={detail.case.id} caseRole={detail.role} />

          {/* Existing Hearings (only renders if hearings exist) */}
          {detail.hearings.length > 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <ExistingHearings
                caseId={detail.case.id}
                caseTitle={detail.case.title}
                viewerRole={detail.role}
                viewerKycVerified={Boolean(user?.kycVerified)}
              />
            </div>
          ) : null}

          {/* AI Judge video session — only when an actual hearing exists */}
          {detail.hearings.length > 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-6">
              <LivekitAnamPanel caseId={detail.case.id} caseTitle={detail.case.title} />
            </div>
          ) : null}

          {/* Manual hearing scheduler — moderator-only escape hatch */}
          {detail.role === "moderator" ? (
            <details className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
              <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-slate-500">
                Manual hearing scheduler (moderator)
              </summary>
              <div className="mt-4">
                <HearingScheduler caseId={detail.case.id} caseTitle={detail.case.title} />
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {activeTab === "judgement" ? (
        <div id="panel-judgement" role="tabpanel" aria-labelledby="tab-judgement" className="rounded-[28px] border border-slate-200 bg-white p-6">
          <JudgementPanel
            caseId={detail.case.id}
            canModerate={detail.role === "moderator"}
            judgement={(detail.case as any).judgementJson}
            finalDecision={detail.case.finalDecision}
            caseStatus={detail.case.status}
          />
        </div>
      ) : null}

        </div>

        {showLawyerChat ? (
          <aside className="lg:sticky lg:top-0 lg:h-screen lg:self-start">
            {selectedLawyer ? (
              <LawyerChatPanel
                caseId={detail.case.id}
                canUseChat
                lawyerName={selectedLawyer.name}
                initialConversation={detail.conversation}
                compact
              />
            ) : (
              <div className="flex h-full flex-col bg-ink p-6 text-white">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Lawyer chat</div>
                <p className="mt-3 text-sm text-slate-300">
                  Select a lawyer to start chatting from this case.
                </p>
                <Link
                  href={`/cases/${detail.case.id}/select-lawyer` as Route}
                  className="mt-3 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-100"
                >
                  Choose lawyer
                </Link>
              </div>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
