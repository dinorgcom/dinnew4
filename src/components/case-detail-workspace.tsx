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
import { AuditTrailPanel } from "@/components/audit-trail-panel";
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
      claimantAddress?: string | null;
      claimantCity?: string | null;
      claimantPostalCode?: string | null;
      claimantCountry?: string | null;
      claimantNameVerified?: string | null;
      claimantKycVerificationId?: string | null;
      respondentName: string | null;
      respondentEmail: string | null;
      respondentPhone: string | null;
      respondentAddress?: string | null;
      respondentCity?: string | null;
      respondentPostalCode?: string | null;
      respondentCountry?: string | null;
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
  { key: "activity", label: "Audit trail" },
  { key: "todo", label: "To do" },
  { key: "claims", label: "Claims" },
  { key: "evidence", label: "Evidence" },
  { key: "witnesses", label: "Witnesses" },
  { key: "consultants", label: "Consultants" },
  { key: "expertise", label: "Expertise" },
  { key: "hearing", label: "Hearing" },
  { key: "audit", label: "Summary" },
  { key: "arbitration", label: "Arbitration" },
  { key: "judgement", label: "Judgement" },
  { key: "appeal", label: "Appeal" },
  { key: "final-judgement", label: "Final judgement" },
  // "settlement" is reachable only via the NAV1 "Offer Settlement" deep
  // link (?tab=settlement). It does NOT appear in the visible tab list.
  { key: "settlement", label: "Settlement (hidden)" },
] as const;

const VISIBLE_TAB_KEYS = new Set([
  "overview",
  "progress",
  "claimant",
  "respondent",
  "activity",
  "todo",
  "claims",
  "evidence",
  "witnesses",
  "consultants",
  "expertise",
  "hearing",
  "audit",
  "arbitration",
  "judgement",
  "appeal",
  "final-judgement",
]);

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
  // useSearchParams returns a stable object reference even when query changes,
  // so we depend on the primitive `tab` string instead. Otherwise the in-page
  // navigation from the NAV1 "Offer Settlement" link to ?tab=settlement won't
  // re-fire the effect when only the search part changes.
  const requestedTab = searchParams?.get("tab") ?? "";
  const initialTab = (() => {
    return requestedTab && tabs.some((t) => t.key === requestedTab)
      ? (requestedTab as (typeof tabs)[number]["key"])
      : "overview";
  })();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>(initialTab);

  useEffect(() => {
    if (requestedTab && tabs.some((t) => t.key === requestedTab)) {
      setActiveTab(requestedTab as (typeof tabs)[number]["key"]);
    }
  }, [requestedTab]);
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
  const [claimantAddress, setClaimantAddress] = useState(detail.case.claimantAddress || "");
  const [claimantCity, setClaimantCity] = useState(detail.case.claimantCity || "");
  const [claimantPostalCode, setClaimantPostalCode] = useState(detail.case.claimantPostalCode || "");
  const [claimantCountry, setClaimantCountry] = useState(detail.case.claimantCountry || "");
  const [respondentName, setRespondentName] = useState(detail.case.respondentName || "");
  const [respondentEmail, setRespondentEmail] = useState(detail.case.respondentEmail || "");
  const [respondentPhone, setRespondentPhone] = useState(detail.case.respondentPhone || "");
  const [respondentAddress, setRespondentAddress] = useState(detail.case.respondentAddress || "");
  const [respondentCity, setRespondentCity] = useState(detail.case.respondentCity || "");
  const [respondentPostalCode, setRespondentPostalCode] = useState(detail.case.respondentPostalCode || "");
  const [respondentCountry, setRespondentCountry] = useState(detail.case.respondentCountry || "");

  
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

  // Best-effort timestamp for each completed stage by walking the activity log
  // in chronological order and matching activity titles.
  const sortedActivities = [...detail.activities].sort((a, b) => {
    const ta = new Date(String(a.createdAt || 0)).getTime();
    const tb = new Date(String(b.createdAt || 0)).getTime();
    return ta - tb;
  });
  function findActivityTime(matcher: (title: string) => boolean): string | null {
    for (const a of sortedActivities) {
      const title = String((a as any).title || "").toLowerCase();
      if (matcher(title)) return String((a as any).createdAt || "");
    }
    return null;
  }
  const lawyerTime = findActivityTime((t) => t.includes("lawyer"));
  const claimsTime = findActivityTime((t) => t.includes("claim"));
  const notifyTime = findActivityTime((t) => t.includes("notif") || t.includes("defendant"));
  const defenceTime = findActivityTime((t) => t.includes("defence") || t.includes("respondent claim"));
  const discoveryTime = findActivityTime(
    (t) => t.includes("evidence") || t.includes("witness") || t.includes("consultant"),
  );
  const hearingTime = findActivityTime((t) => t.includes("hearing"));
  const auditTime = findActivityTime((t) => t.includes("audit"));
  const arbitrationTime = findActivityTime((t) => t.includes("arbitration"));
  const rulingTime = findActivityTime((t) => t.includes("judgement"));
  const finalTime = String(detail.case.finalDecision ? (detail.case as any).updatedAt || "" : "") || null;

  const progressStagesRaw: Array<{ key: string; label: string; completed: boolean; completedAt?: string | null }> = [
    { key: "lawyer", label: "Lawyer selection", completed: selectedLawyer !== null, completedAt: lawyerTime },
    { key: "claims", label: "Submit claims", completed: claimsSubmitted, completedAt: claimsTime },
    { key: "notify", label: "Notify the opponent", completed: detail.respondentNotified, completedAt: notifyTime },
    { key: "defence", label: "Opponents defence", completed: respondentDefenceSubmitted, completedAt: defenceTime },
    { key: "discovery", label: "Discovery phase", completed: discoveryStarted, completedAt: discoveryTime },
    { key: "hearing", label: "Hearing", completed: hearingCompleted, completedAt: hearingTime },
    { key: "audit", label: "Summary", completed: auditRequested, completedAt: auditTime },
    { key: "arbitration", label: "Arbitration", completed: arbitrationRequested, completedAt: arbitrationTime },
    { key: "ruling", label: "Ruling", completed: rulingIssued, completedAt: rulingTime },
    { key: "appeal", label: "Appeal", completed: false, completedAt: null },
    { key: "final", label: "Final Ruling", completed: finalRulingIssued, completedAt: finalTime },
  ];

  // Enforce sequential completion: a stage is only "completed" if all prior
  // stages are also completed.
  let priorAllCompleted = true;
  const progressStages = progressStagesRaw.map((stage) => {
    const completed = priorAllCompleted && stage.completed;
    priorAllCompleted = completed;
    return { ...stage, completed, completedAt: completed ? stage.completedAt ?? null : null };
  });

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

  // Compute "needs viewer's attention" flags per tab so the sidebar can
  // highlight tabs in orange when the current party still has something to do.
  const role = detail.role;
  const isParty = role === "claimant" || role === "respondent";
  function hasPendingReview(records: WorkspaceRecord[], submitterField: "submittedBy" | "calledBy") {
    if (!isParty) return false;
    const opposing = role === "claimant" ? "respondent" : "claimant";
    return records.some((r) => {
      const submittedBy = String((r as any)[submitterField] || "").toLowerCase();
      const state = String((r as any).reviewState || "pending").toLowerCase();
      const deadlineRaw = (r as any).discussionDeadline;
      const deadline = deadlineRaw ? new Date(deadlineRaw) : null;
      const expired = deadline && !Number.isNaN(deadline.getTime()) && new Date() > deadline;
      return submittedBy === opposing && state === "pending" && !expired;
    });
  }
  const claimsNeedAttention =
    isParty &&
    ((role === "claimant" && (!detail.case.claimantClaims || detail.case.claimantClaims.length === 0)) ||
      (role === "respondent" && (!detail.case.respondentClaims || detail.case.respondentClaims.length === 0)));
  const evidenceNeedsAttention = hasPendingReview(detail.evidence, "submittedBy");
  const witnessesNeedAttention = hasPendingReview(detail.witnesses, "calledBy");
  const consultantsNeedAttention = hasPendingReview(detail.consultants, "calledBy");
  const expertiseNeedsAttention =
    isParty &&
    detail.expertiseRequests.some((r) => String((r as any).status || "").toLowerCase() === "ready");
  const respondentTabNeedsAttention =
    role === "claimant" && !detail.respondentNotified;
  const arbitrationProposal = (detail.case as any).arbitrationProposalJson;
  const claimantArbResp = (detail.case as any).arbitrationClaimantResponse;
  const respondentArbResp = (detail.case as any).arbitrationRespondentResponse;
  // The settlement-offer flow (party-to-party) reuses the arbitration_proposal
  // column under the hood. Pending response on it is a Settlement task, not an
  // Arbitration task. Arbitration becomes a separate DIN.ORG-side proposal
  // post-proceedings and never lights up the Arbitration tab in orange.
  // A settlement is dead the moment ONE party rejects it — so don't keep
  // pestering the other party for a response after that.
  const settlementRejected =
    claimantArbResp === "rejected" || respondentArbResp === "rejected";
  const settlementNeedsAttention =
    !!arbitrationProposal &&
    !settlementRejected &&
    ((role === "claimant" && !claimantArbResp) ||
      (role === "respondent" && !respondentArbResp));
  const todoNeedsAttention =
    claimsNeedAttention ||
    evidenceNeedsAttention ||
    witnessesNeedAttention ||
    consultantsNeedAttention ||
    expertiseNeedsAttention ||
    respondentTabNeedsAttention ||
    settlementNeedsAttention;

  const tabAttention: Partial<Record<(typeof tabs)[number]["key"], boolean>> = {
    claims: claimsNeedAttention,
    evidence: evidenceNeedsAttention,
    witnesses: witnessesNeedAttention,
    consultants: consultantsNeedAttention,
    expertise: expertiseNeedsAttention,
    respondent: respondentTabNeedsAttention,
    todo: todoNeedsAttention,
  };

  // Store original values to track changes
  const originalContacts = {
    claimantName: detail.case.claimantName || "",
    claimantEmail: detail.case.claimantEmail || "",
    claimantPhone: detail.case.claimantPhone || "",
    claimantAddress: detail.case.claimantAddress || "",
    claimantCity: detail.case.claimantCity || "",
    claimantPostalCode: detail.case.claimantPostalCode || "",
    claimantCountry: detail.case.claimantCountry || "",
    respondentName: detail.case.respondentName || "",
    respondentEmail: detail.case.respondentEmail || "",
    respondentPhone: detail.case.respondentPhone || "",
    respondentAddress: detail.case.respondentAddress || "",
    respondentCity: detail.case.respondentCity || "",
    respondentPostalCode: detail.case.respondentPostalCode || "",
    respondentCountry: detail.case.respondentCountry || "",
  };

  // Check if any contact fields have changed
  const contactsHaveChanged =
    claimantName !== originalContacts.claimantName ||
    claimantEmail !== originalContacts.claimantEmail ||
    claimantPhone !== originalContacts.claimantPhone ||
    claimantAddress !== originalContacts.claimantAddress ||
    claimantCity !== originalContacts.claimantCity ||
    claimantPostalCode !== originalContacts.claimantPostalCode ||
    claimantCountry !== originalContacts.claimantCountry ||
    respondentName !== originalContacts.respondentName ||
    respondentEmail !== originalContacts.respondentEmail ||
    respondentPhone !== originalContacts.respondentPhone ||
    respondentAddress !== originalContacts.respondentAddress ||
    respondentCity !== originalContacts.respondentCity ||
    respondentPostalCode !== originalContacts.respondentPostalCode ||
    respondentCountry !== originalContacts.respondentCountry;

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
          claimantAddress: claimantAddress.trim() ? claimantAddress : null,
          claimantCity: claimantCity.trim() ? claimantCity : null,
          claimantPostalCode: claimantPostalCode.trim() ? claimantPostalCode : null,
          claimantCountry: claimantCountry.trim() ? claimantCountry : null,
          respondentName,
          respondentEmail,
          respondentPhone: respondentPhone.trim() ? respondentPhone : null,
          respondentAddress: respondentAddress.trim() ? respondentAddress : null,
          respondentCity: respondentCity.trim() ? respondentCity : null,
          respondentPostalCode: respondentPostalCode.trim() ? respondentPostalCode : null,
          respondentCountry: respondentCountry.trim() ? respondentCountry : null,
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

  function renderClaimEntry(
    kind: "claimant" | "respondent",
    index: number,
    claim: Claim,
  ) {
    const claims = kind === "claimant" ? claimantClaims : respondentClaims;
    const setClaims = kind === "claimant" ? setClaimantClaims : setRespondentClaims;
    const canEdit = detail.role === kind;
    const eyebrow = kind === "claimant" ? `CLAIM ${index + 1}` : `DEFENSE ${index + 1}`;
    const eyebrowClass =
      kind === "claimant"
        ? "text-rose-600"
        : "text-indigo-600";
    const cardClass =
      kind === "claimant"
        ? "rounded-md border border-slate-200 bg-white p-4"
        : "ml-6 rounded-md border border-indigo-200 bg-indigo-50/40 p-4";

    return (
      <div key={`${kind}-${index}`} className={cardClass}>
        <div className="flex items-start justify-between gap-3">
          <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}>
            {eyebrow}
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setClaims(claims.filter((_, claimIndex) => claimIndex !== index))}
              className="rounded-md border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
            >
              Delete
            </button>
          ) : null}
        </div>
        {canEdit ? (
          <div className="mt-3 space-y-3">
            <input
              value={claim.claim}
              onChange={(event) =>
                setClaims(
                  claims.map((item, claimIndex) =>
                    claimIndex === index ? { ...item, claim: event.target.value } : item,
                  ),
                )
              }
              placeholder={kind === "claimant" ? "Claim title" : "Defense title"}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
              placeholder="Details"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        ) : (
          <>
            <div className="mt-2 font-semibold text-slate-900">{claim.claim || "—"}</div>
            <div className="mt-2 text-sm leading-7 text-slate-600 whitespace-pre-wrap">{claim.details}</div>
          </>
        )}
      </div>
    );
  }

  function renderClaimsAndDefenses() {
    const total = Math.max(claimantClaims.length, respondentClaims.length);
    const canEditClaimant = detail.role === "claimant";
    const canEditRespondent = detail.role === "respondent";

    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold text-ink">Claims &amp; defenses</h3>
          <div className="flex gap-2">
            {canEditClaimant ? (
              <button
                type="button"
                onClick={() =>
                  setClaimantClaims([
                    ...claimantClaims,
                    { claim: "", details: "", evidenceIds: [], witnessIds: [], responses: [] },
                  ])
                }
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                + Add claim
              </button>
            ) : null}
            {canEditRespondent ? (
              <button
                type="button"
                onClick={() =>
                  setRespondentClaims([
                    ...respondentClaims,
                    { claim: "", details: "", evidenceIds: [], witnessIds: [], responses: [] },
                  ])
                }
                className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                + Add defense
              </button>
            ) : null}
          </div>
        </div>
        {total === 0 ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            No claims submitted yet.
          </div>
        ) : (
          <ol className="space-y-4">
            {Array.from({ length: total }).map((_, index) => (
              <li key={index} className="space-y-3">
                {claimantClaims[index]
                  ? renderClaimEntry("claimant", index, claimantClaims[index])
                  : canEditClaimant ? (
                      <button
                        type="button"
                        onClick={() =>
                          setClaimantClaims([
                            ...claimantClaims,
                            { claim: "", details: "", evidenceIds: [], witnessIds: [], responses: [] },
                          ])
                        }
                        className="w-full rounded-md border border-dashed border-rose-300 bg-rose-50/40 p-3 text-left text-xs text-rose-700 hover:bg-rose-50"
                      >
                        + Add CLAIM {index + 1}
                      </button>
                    ) : (
                      <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                        No claim {index + 1} from claimant
                      </div>
                    )}
                {respondentClaims[index]
                  ? renderClaimEntry("respondent", index, respondentClaims[index])
                  : canEditRespondent ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRespondentClaims([
                            ...respondentClaims,
                            { claim: "", details: "", evidenceIds: [], witnessIds: [], responses: [] },
                          ])
                        }
                        className="ml-6 w-[calc(100%-1.5rem)] rounded-md border border-dashed border-indigo-300 bg-indigo-50/30 p-3 text-left text-xs text-indigo-700 hover:bg-indigo-50/60"
                      >
                        + Add DEFENSE {index + 1}
                      </button>
                    ) : (
                      <div className="ml-6 rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-400">
                        No defense {index + 1} from respondent
                      </div>
                    )}
              </li>
            ))}
          </ol>
        )}
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
        <aside className="lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto bg-ink p-4 lg:pt-[68px] text-white">
          <div role="tablist" aria-label="Case workspace sections" className="flex flex-col gap-1">
            {tabs.filter((tab) => VISIBLE_TAB_KEYS.has(tab.key)).map((tab) => {
              const needsAttention = !!tabAttention[tab.key];
              const isOverview = tab.key === "overview";
              const isActive = activeTab === tab.key;
              if (isOverview) {
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    role="tab"
                    id={`tab-${tab.key}`}
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.key}`}
                    className={`block min-h-[88px] w-full rounded-md px-3 py-2.5 text-left transition ${
                      isActive ? "bg-rose-700 shadow" : "bg-rose-600 hover:bg-rose-700"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-[0.2em] text-rose-100">Case</div>
                    <div className="mt-1 text-sm font-semibold leading-snug text-white line-clamp-3">
                      {detail.case.title}
                    </div>
                  </button>
                );
              }
              const tabClass = isActive
                ? "bg-white text-ink shadow"
                : needsAttention
                  ? "bg-orange-500/90 text-white hover:bg-orange-500"
                  : "text-slate-300 hover:bg-white/10 hover:text-white";
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  role="tab"
                  id={`tab-${tab.key}`}
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.key}`}
                  className={`flex items-start justify-between rounded-md px-4 py-2.5 text-sm font-medium transition ${tabClass}`}
                >
                  <span className="truncate">{tab.label}</span>
                  {tabCounts[tab.key as keyof typeof tabCounts] > 0 ? (
                    <span className={`ml-2 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      isActive ? "bg-ink/10 text-ink" : needsAttention ? "bg-white/30 text-white" : "bg-white/10 text-slate-200"
                    }`}>
                      {tabCounts[tab.key as keyof typeof tabCounts]}
                    </span>
                  ) : needsAttention ? (
                    <span className="ml-2 inline-block h-2 w-2 shrink-0 self-center rounded-md bg-white" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
            {detail.role === "moderator" ? (
              <Link
                href={`/cases/${detail.case.id}/edit` as Route}
                className="mt-3 block rounded-md border border-white/30 px-4 py-2.5 text-center text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
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
                    className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
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
            <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

      {activeTab === "overview" ? (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-6">
          <section className="space-y-6 rounded-md border border-slate-200 bg-white p-6">
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
                <div key={label} className="rounded-md bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
                  <div className="mt-2 text-sm font-semibold capitalize text-slate-900">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Lawyer</div>
              {selectedLawyer ? (
                <div className="mt-3">
                  <div className="text-xl font-semibold text-ink">{selectedLawyer.name}</div>
                  <div className="mt-1 text-sm text-slate-600">{selectedLawyer.style}</div>
                </div>
              ) : detail.role === "claimant" || detail.role === "respondent" ? (
                <Link
                  href={`/cases/${detail.case.id}/select-lawyer` as Route}
                  className="mt-3 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
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
        <div id="panel-claimant" role="tabpanel" aria-labelledby="tab-claimant" className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Claimant</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
              {detail.case.claimantName || "-"}
            </h2>
          </div>
          {detail.role === "claimant" ? (
            <div className="space-y-3 rounded-md bg-slate-50 p-4">
              <input
                value={claimantName}
                onChange={(event) => setClaimantName(event.target.value)}
                placeholder="Name"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={claimantEmail}
                onChange={(event) => setClaimantEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={claimantPhone}
                onChange={(event) => setClaimantPhone(event.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={claimantAddress}
                onChange={(event) => setClaimantAddress(event.target.value)}
                placeholder="Street address"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={claimantPostalCode}
                  onChange={(event) => setClaimantPostalCode(event.target.value)}
                  placeholder="Postal code"
                  className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
                />
                <input
                  value={claimantCity}
                  onChange={(event) => setClaimantCity(event.target.value)}
                  placeholder="City"
                  className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
                />
              </div>
              <input
                value={claimantCountry}
                onChange={(event) => setClaimantCountry(event.target.value)}
                placeholder="Country"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              {contactsError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {contactsError}
                </div>
              ) : null}
              <button
                type="button"
                disabled={contactsSaving || !contactsHaveChanged}
                onClick={() => void saveContacts()}
                className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {contactsSaving ? "Saving..." : "Save claimant details"}
              </button>
            </div>
          ) : (
            <dl className="grid gap-2 rounded-md bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</dt>
                <dd className="text-slate-700">{detail.case.claimantEmail || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Phone</dt>
                <dd className="text-slate-700">{detail.case.claimantPhone || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Address</dt>
                <dd className="text-slate-700">
                  {[detail.case.claimantAddress, detail.case.claimantPostalCode, detail.case.claimantCity, detail.case.claimantCountry]
                    .filter(Boolean)
                    .join(", ") || "-"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      ) : null}

      {activeTab === "respondent" ? (
        <div id="panel-respondent" role="tabpanel" aria-labelledby="tab-respondent" className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
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
            <div className="space-y-3 rounded-md bg-slate-50 p-4">
              <input
                value={respondentName}
                onChange={(event) => setRespondentName(event.target.value)}
                placeholder="Name"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={respondentEmail}
                onChange={(event) => setRespondentEmail(event.target.value)}
                placeholder="Email"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={respondentPhone}
                onChange={(event) => setRespondentPhone(event.target.value)}
                placeholder="Phone (optional)"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <input
                value={respondentAddress}
                onChange={(event) => setRespondentAddress(event.target.value)}
                placeholder="Street address"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={respondentPostalCode}
                  onChange={(event) => setRespondentPostalCode(event.target.value)}
                  placeholder="Postal code"
                  className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
                />
                <input
                  value={respondentCity}
                  onChange={(event) => setRespondentCity(event.target.value)}
                  placeholder="City"
                  className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
                />
              </div>
              <input
                value={respondentCountry}
                onChange={(event) => setRespondentCountry(event.target.value)}
                placeholder="Country"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              {contactsError ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {contactsError}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={contactsSaving || !contactsHaveChanged}
                  onClick={() => void saveContacts()}
                  className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
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
                    className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isPending ? "Sending..." : notificationSent ? "Respondent notified" : "Notify respondent"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <dl className="grid gap-2 rounded-md bg-slate-50 p-4 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</dt>
                <dd className="text-slate-700">{detail.case.respondentEmail || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Phone</dt>
                <dd className="text-slate-700">{detail.case.respondentPhone || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Address</dt>
                <dd className="text-slate-700">
                  {[detail.case.respondentAddress, detail.case.respondentPostalCode, detail.case.respondentCity, detail.case.respondentCountry]
                    .filter(Boolean)
                    .join(", ") || "-"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      ) : null}

      {activeTab === "activity" ? (
        <div id="panel-activity" role="tabpanel" aria-labelledby="tab-activity">
          <AuditTrailPanel caseId={detail.case.id} />
        </div>
      ) : null}

      {activeTab === "todo" ? (
        <div id="panel-todo" role="tabpanel" aria-labelledby="tab-todo" className="rounded-md border border-slate-200 bg-white p-6">
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
            // Settlement-offer response pending (the party-to-party flow lives
            // behind the NAV1 "Offer Settlement" link and the hidden settlement
            // tab; it reuses the arbitration_proposal column under the hood).
            // A single "rejected" from either side closes the settlement, so
            // we stop nagging once that has happened.
            const claimantArb = (detail.case as any).arbitrationClaimantResponse;
            const respondentArb = (detail.case as any).arbitrationRespondentResponse;
            const proposal = (detail.case as any).arbitrationProposalJson;
            const proposalIsRejected =
              claimantArb === "rejected" || respondentArb === "rejected";
            if (proposal && !proposalIsRejected) {
              if (role === "claimant" && !claimantArb) {
                items.push({ key: "respond-settlement-c", label: "Respond to the settlement offer", tab: "settlement" });
              }
              if (role === "respondent" && !respondentArb) {
                items.push({ key: "respond-settlement-r", label: "Respond to the settlement offer", tab: "settlement" });
              }
            }

            if (items.length === 0) {
              return (
                <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  Nothing waiting on you right now.
                </div>
              );
            }

            return (
              <ul className="mt-4 space-y-2">
                {items.map((item) => (
                  <li key={item.key} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-100 p-4">
                    <div className="text-sm font-medium text-slate-800">{item.label}</div>
                    {item.tab ? (
                      <button
                        type="button"
                        onClick={() => setActiveTab(item.tab as (typeof tabs)[number]["key"])}
                        className="rounded-md bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        Open
                      </button>
                    ) : item.href ? (
                      <Link
                        href={item.href as Route}
                        className="rounded-md bg-ink px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
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
        <div id="panel-appeal" role="tabpanel" aria-labelledby="tab-appeal" className="space-y-4">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">Appeal only becomes available after judgement.</span>{" "}
            Once the judgement is issued you will be able to request review by a juror panel.
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Appeal</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Request an appeal</h2>
            <p className="mt-2 text-sm text-slate-600">
              If you disagree with the judgement, you may request an appeal reviewed by a panel of jurors.
              Each juror costs <strong>{ACTION_COSTS.appeal_request} tokens</strong>. Choose 1, 3, 5, or 7 jurors (max 7).
            </p>
            <AppealPanel caseId={detail.case.id} canRequest={detail.role === "claimant" || detail.role === "respondent"} />
          </div>
        </div>
      ) : null}

      {activeTab === "final-judgement" ? (
        <div id="panel-final-judgement" role="tabpanel" aria-labelledby="tab-final-judgement" className="rounded-md border border-slate-200 bg-white p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Final judgement</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">After appeal</h2>
          <p className="mt-2 text-sm text-slate-600">
            The final, binding judgement issued after appeal review. This decision closes the case.
          </p>
          {(detail.case as any).finalAppealJudgement ? (
            <div className="mt-4 rounded-md bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
              {String((detail.case as any).finalAppealJudgement)}
            </div>
          ) : (
            <div className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
              No final judgement has been issued yet.
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "progress" ? (
        <div id="panel-progress" role="tabpanel" aria-labelledby="tab-progress" className="rounded-md border border-slate-200 bg-white p-6">
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
                      className={`flex h-9 w-9 items-center justify-center rounded-md text-sm font-semibold ${
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
                      {stage.completed
                        ? stage.completedAt
                          ? `Completed · ${formatDateTime(stage.completedAt)}`
                          : "Completed"
                        : isActive
                          ? "Current step"
                          : "Pending"}
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
          {renderClaimsAndDefenses()}
          {detail.role !== "moderator" && detail.role !== "admin" ? (
            <div className="sticky bottom-0 flex justify-end rounded-md border border-slate-200 bg-white/95 p-3 backdrop-blur">
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  startTransition(() =>
                    void patch(`/api/cases/${detail.case.id}/claims`, {
                      claimantClaims,
                      respondentClaims,
                    }),
                  )
                }
                className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save claims"}
              </button>
            </div>
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
        <div id="panel-audit" role="tabpanel" aria-labelledby="tab-audit" className="rounded-md border border-slate-200 bg-white p-6">
          <AuditPanel caseId={detail.case.id} audits={detail.audits || []} userRole={detail.role} />
        </div>
      ) : null}

      {activeTab === "arbitration" ? (
        <div id="panel-arbitration" role="tabpanel" aria-labelledby="tab-arbitration" className="space-y-4">
          <div className="rounded-md border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-800">
            <span className="font-semibold">
              Arbitration becomes available only after the case proceedings are complete.
            </span>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-6 space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Binding arbitration
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              How it works
            </h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700">
              <li>
                Once the proceedings (claims, evidence, witnesses, consultants,
                expertise, hearing) are closed, the AI judge produces a binding
                arbitration proposal.
              </li>
              <li>
                If <strong>both parties accept</strong> the proposal, it
                becomes the final, binding outcome of the case.
              </li>
              <li>
                If <strong>either party declines</strong>, the AI judge issues
                a judgement instead, and the case continues to the Judgement
                step.
              </li>
            </ol>
            <p className="text-xs text-slate-500">
              For a non-binding settlement offer between the parties at any
              point during proceedings, use{" "}
              <span className="font-semibold">Offer Settlement</span> in the
              left sidebar.
            </p>
          </div>
        </div>
      ) : null}

      {activeTab === "settlement" ? (
        <div id="panel-settlement" role="tabpanel" aria-labelledby="tab-settlement" className="rounded-md border border-slate-200 bg-white p-6">
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
            <div className="rounded-md border border-slate-200 bg-white p-6">
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
            <div className="rounded-md border border-slate-200 bg-white p-6">
              <LivekitAnamPanel caseId={detail.case.id} caseTitle={detail.case.title} />
            </div>
          ) : null}

          {/* Manual hearing scheduler — moderator-only escape hatch */}
          {detail.role === "moderator" ? (
            <details className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
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
        <div id="panel-judgement" role="tabpanel" aria-labelledby="tab-judgement" className="rounded-md border border-slate-200 bg-white p-6">
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
                  className="mt-3 inline-flex rounded-md bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-slate-100"
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
