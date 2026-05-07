"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { upload as blobUpload } from "@vercel/blob/client";
import { CaseWorkspace } from "@/components/case-workspace";
import { LawyersPanel } from "@/components/lawyers-panel";
import { AdditionalPartiesSection } from "@/components/additional-parties-panel";
import { PleadingsPanel } from "@/components/pleadings-panel";
import { LawyerChatPanel } from "@/components/lawyer-chat-panel";
import { AuditPanel } from "@/components/audit-panel";
import { ArbitrationPanel } from "@/components/arbitration-panel";
import { HearingScheduler } from "@/components/hearing-scheduler";
import { HearingProposalPanel } from "@/components/hearing-proposal-panel";
import { ScriptedHearingPanel } from "@/components/scripted-hearing-panel";
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
      language?: string | null;
      claimantClaims: Record<string, unknown>[] | null;
      respondentClaims: Record<string, unknown>[] | null;
      claimantStatement?: string | null;
      respondentStatement?: string | null;
      claimantStatementFileUrl?: string | null;
      claimantStatementFilePathname?: string | null;
      claimantStatementFileName?: string | null;
      respondentStatementFileUrl?: string | null;
      respondentStatementFilePathname?: string | null;
      respondentStatementFileName?: string | null;
      claimantStatementFileTranslationUrl?: string | null;
      claimantStatementFileTranslationName?: string | null;
      claimantStatementFileTranslationLang?: string | null;
      respondentStatementFileTranslationUrl?: string | null;
      respondentStatementFileTranslationName?: string | null;
      respondentStatementFileTranslationLang?: string | null;
      claimantLawyerKey: string | null;
      respondentLawyerKey?: string | null;
      respondentLinkedAt?: string | Date | null;
      respondentUserId?: string | null;
      arbitratorAssignedName: string | null;
      finalDecision: string | null;
      discoveryReadyClaimantAt?: string | Date | null;
      discoveryReadyRespondentAt?: string | Date | null;
    };
    role: string;
    roleLabel: string;
    evidence: WorkspaceRecord[];
    witnesses: WorkspaceRecord[];
    consultants: WorkspaceRecord[];
    lawyers: WorkspaceRecord[];
    parties: WorkspaceRecord[];
    viewerPartyId?: string | null;
    pleadings?: Array<{
      side: "claimant" | "respondent";
      round: 1 | 2;
      label: string;
      text: string | null;
      fileUrl: string | null;
      fileName: string | null;
      filePathname: string | null;
      translationUrl: string | null;
      translationName: string | null;
      translationLang: string | null;
      lockedAt: string | Date | null;
      reachable: boolean;
      exists: boolean;
    }>;
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
  { key: "lawyers", label: "Lawyers" },
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
  "lawyers",
  "expertise",
  "hearing",
  "audit",
  "arbitration",
  "judgement",
  "appeal",
  "final-judgement",
]);

const CASE_NAV_GROUPS: Array<{
  label: string;
  items: Array<(typeof tabs)[number]["key"]>;
}> = [
  { label: "Start", items: ["todo", "progress"] },
  { label: "Case file", items: ["claimant", "respondent", "claims"] },
  { label: "Discovery", items: ["evidence", "witnesses", "consultants", "lawyers", "expertise"] },
  { label: "Decision", items: ["hearing", "audit", "arbitration", "judgement", "appeal", "final-judgement"] },
  { label: "History", items: ["activity"] },
];

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
  // New free-form per-side statements that replace the structured claim list.
  const [claimantStatement, setClaimantStatement] = useState(detail.case.claimantStatement ?? "");
  const [respondentStatement, setRespondentStatement] = useState(
    detail.case.respondentStatement ?? "",
  );
  const [statementSaving, setStatementSaving] = useState(false);
  const [statementUploading, setStatementUploading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const statementFileInputRef = useRef<HTMLInputElement | null>(null);
  const [sanitizing, setSanitizing] = useState(false);
  const [translating, setTranslating] = useState<"claimant" | "respondent" | null>(null);
  const [translatingDoc, setTranslatingDoc] = useState<"claimant" | "respondent" | null>(null);
  const [translationResult, setTranslationResult] = useState<{
    side: "claimant" | "respondent";
    text: string;
    targetLang: string;
    detectedSourceLang: string;
  } | null>(null);
  const [sanitizeResult, setSanitizeResult] = useState<{
    side: "claimant" | "respondent";
    sanitized: string;
    removed: Array<{ passage: string; reason: string }>;
    note: string;
  } | null>(null);
  const [arbitrator, setArbitrator] = useState(detail.case.arbitratorAssignedName || "");
  const [caseLang, setCaseLang] = useState(detail.case.language || "en");
  const [caseLangSaving, setCaseLangSaving] = useState(false);
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

  // Both sides "submitting claims" now just means they've posted their
  // free-form statement. Legacy structured claims are kept readable
  // (claimantClaims / respondentClaims arrays) but no longer drive the
  // progress tracker — the migration backfilled them into the new
  // statement columns so existing cases stay intact.
  const claimsSubmitted =
    !!(detail.case.claimantStatement || "").trim() ||
    !!(detail.case.respondentStatement || "").trim() ||
    !!detail.case.claimantStatementFileUrl ||
    !!detail.case.respondentStatementFileUrl;
  const respondentDefenceSubmitted =
    !!(detail.case.respondentStatement || "").trim() ||
    !!detail.case.respondentStatementFileUrl;
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

  // Calculate tab counts. The Claims tab shows N/4 — number of locked
  // pleadings out of the four canonical slots.
  const pleadingsList = detail.pleadings ?? [];
  const lockedCount = pleadingsList.filter((p) => !!p.lockedAt).length;
  // Per-side "has anything posted in their open slot" — used for the
  // attention flag and to keep some legacy code paths around the
  // discovery-readiness signal.
  const claimantHasStatement = pleadingsList.some(
    (p) => p.side === "claimant" && (p.lockedAt || (p.text && p.text.trim()) || p.fileUrl),
  );
  const respondentHasStatement = pleadingsList.some(
    (p) => p.side === "respondent" && (p.lockedAt || (p.text && p.text.trim()) || p.fileUrl),
  );
  const tabCounts = {
    claims: lockedCount,
    evidence: detail.evidence.length,
    witnesses: detail.witnesses.length,
    consultants: detail.consultants.length,
    lawyers: detail.lawyers.length,
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
  // Claims tab needs the viewer's attention if THEIR side has at least
  // one slot that is currently reachable (predecessor locked) and not
  // yet finalized.
  const claimsNeedAttention =
    isParty &&
    pleadingsList.some(
      (p) => p.side === role && p.reachable && !p.lockedAt,
    );
  const evidenceNeedsAttention = hasPendingReview(detail.evidence, "submittedBy");
  const witnessesNeedAttention = hasPendingReview(detail.witnesses, "calledBy");
  const consultantsNeedAttention = hasPendingReview(detail.consultants, "calledBy");
  const lawyersNeedAttention = hasPendingReview(detail.lawyers, "calledBy");
  // Pending co-claimant / co-respondent proposals show up under the
  // matching side's tab — each side's tab lights up when the viewer
  // (an active party) still has to vote on at least one open proposal
  // on that side.
  const viewerPartyId = detail.viewerPartyId ?? null;
  function pendingVoteOnSide(side: "claimant" | "respondent") {
    if (!isParty || !viewerPartyId) return false;
    return detail.parties.some((p) => {
      if ((p as any).side !== side) return false;
      const status = String((p as any).status || "");
      if (status !== "pending_approval") return false;
      const votes = ((p as any).approvalVotesJson || {}) as Record<string, string>;
      const invitedBy = (p as any).invitedByPartyId as string | null | undefined;
      // The inviter has implicitly approved their own proposal — don't
      // tell them to vote on it again.
      if (invitedBy === viewerPartyId) return false;
      return !votes[viewerPartyId];
    });
  }
  const claimantPartiesNeedAttention = pendingVoteOnSide("claimant");
  const respondentPartiesNeedAttention = pendingVoteOnSide("respondent");
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
  // Discovery readiness handshake — needed when every review is settled
  // and the viewer party still has to click "I'm ready" on the Hearing tab.
  const evidenceAllSettled = detail.evidence.every((e) => {
    const state = String((e as any).reviewState || "pending").toLowerCase();
    if (state !== "pending") return true;
    const deadline = (e as any).discussionDeadline;
    if (!deadline) return false;
    const d = new Date(deadline);
    return !Number.isNaN(d.getTime()) && new Date() > d;
  });
  const witnessesAllSettled = detail.witnesses.every(
    (w) => String((w as any).status || "").toLowerCase() !== "pending",
  );
  const expertiseAllSettled = detail.expertiseRequests.every((er) => {
    const s = String((er as any).status || "").toLowerCase();
    return s !== "draft" && s !== "generating";
  });
  const allReviewsSettled = evidenceAllSettled && witnessesAllSettled && expertiseAllSettled;
  const claimantReadyConfirmed = !!(detail.case as any).discoveryReadyClaimantAt;
  const respondentReadyConfirmed = !!(detail.case as any).discoveryReadyRespondentAt;
  const hearingNeedsAttention =
    allReviewsSettled &&
    ((role === "claimant" && !claimantReadyConfirmed) ||
      (role === "respondent" && !respondentReadyConfirmed));

  const todoNeedsAttention =
    claimsNeedAttention ||
    evidenceNeedsAttention ||
    witnessesNeedAttention ||
    consultantsNeedAttention ||
    lawyersNeedAttention ||
    claimantPartiesNeedAttention ||
    respondentPartiesNeedAttention ||
    expertiseNeedsAttention ||
    respondentTabNeedsAttention ||
    settlementNeedsAttention ||
    hearingNeedsAttention;

  const tabAttention: Partial<Record<(typeof tabs)[number]["key"], boolean>> = {
    claims: claimsNeedAttention,
    evidence: evidenceNeedsAttention,
    witnesses: witnessesNeedAttention,
    consultants: consultantsNeedAttention,
    lawyers: lawyersNeedAttention,
    expertise: expertiseNeedsAttention,
    claimant: claimantPartiesNeedAttention,
    respondent: respondentTabNeedsAttention || respondentPartiesNeedAttention,
    hearing: hearingNeedsAttention,
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

  type StatementUpdateBody = {
    statement: string;
    attachment?: {
      url: string;
      pathname: string;
      fileName: string;
      contentType?: string | null;
      size?: number | null;
    };
    removeAttachment?: boolean;
  };

  async function postStatementUpdate(body: StatementUpdateBody) {
    const response = await fetch(`/api/cases/${detail.case.id}/statement`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result?.error?.message || "Failed to save statement.");
    }
  }

  async function saveStatement() {
    setStatementError(null);
    setStatementSaving(true);
    try {
      const isClaimant = detail.role === "claimant";
      const isRespondent = detail.role === "respondent";
      if (!isClaimant && !isRespondent) return;
      const text = (isClaimant ? claimantStatement : respondentStatement) ?? "";
      await postStatementUpdate({ statement: text });
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Failed to save statement.");
    } finally {
      setStatementSaving(false);
    }
  }

  async function uploadStatementFile(file: File) {
    setStatementError(null);
    setStatementUploading(true);
    try {
      const isClaimant = detail.role === "claimant";
      const isRespondent = detail.role === "respondent";
      if (!isClaimant && !isRespondent) return;

      const MAX_BYTES = 100 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        setStatementError("File too large — 100 MB maximum.");
        return;
      }
      const blob = await blobUpload(file.name || "statement.pdf", file, {
        access: "private",
        handleUploadUrl: `/api/cases/${detail.case.id}/uploads/token`,
        clientPayload: JSON.stringify({ category: "statement" }),
      });
      const text = (isClaimant ? claimantStatement : respondentStatement) ?? "";
      await postStatementUpdate({
        statement: text,
        attachment: {
          url: blob.url,
          pathname: blob.pathname,
          fileName: file.name,
          contentType: file.type || null,
          size: file.size || null,
        },
      });
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setStatementUploading(false);
      if (statementFileInputRef.current) {
        statementFileInputRef.current.value = "";
      }
    }
  }

  async function saveCaseLanguage(language: string) {
    setCaseLangSaving(true);
    try {
      const response = await fetch(`/api/cases/${detail.case.id}/language`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        alert(body?.error?.message || "Failed to update language");
        setCaseLang(detail.case.language || "en");
        return;
      }
      router.refresh();
    } finally {
      setCaseLangSaving(false);
    }
  }

  async function runTranslateText(side: "claimant" | "respondent") {
    setStatementError(null);
    setTranslating(side);
    setTranslationResult(null);
    try {
      const response = await fetch(
        `/api/cases/${detail.case.id}/statement/translate?side=${side}`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatementError(body?.error?.message || "Translation failed.");
        return;
      }
      const data = body?.data as
        | { translatedText: string; detectedSourceLang: string; targetLang: string }
        | undefined;
      if (!data) {
        setStatementError("Translation returned no result.");
        return;
      }
      setTranslationResult({
        side,
        text: data.translatedText,
        targetLang: data.targetLang,
        detectedSourceLang: data.detectedSourceLang,
      });
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Translation failed.");
    } finally {
      setTranslating(null);
    }
  }

  async function runTranslateDocument(side: "claimant" | "respondent") {
    setStatementError(null);
    setTranslatingDoc(side);
    try {
      const response = await fetch(
        `/api/cases/${detail.case.id}/statement/translate-document?side=${side}`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatementError(body?.error?.message || "Document translation failed.");
        return;
      }
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Document translation failed.");
    } finally {
      setTranslatingDoc(null);
    }
  }

  async function runSanitize() {
    setStatementError(null);
    setSanitizing(true);
    setSanitizeResult(null);
    try {
      const isClaimant = detail.role === "claimant";
      const isRespondent = detail.role === "respondent";
      if (!isClaimant && !isRespondent) return;
      const response = await fetch(
        `/api/cases/${detail.case.id}/statement/sanitize`,
        { method: "POST" },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatementError(result?.error?.message || "Sanitize failed.");
        return;
      }
      const data = result?.data as {
        sanitized: string;
        removed: Array<{ passage: string; reason: string }>;
        note: string;
      } | undefined;
      if (!data) {
        setStatementError("Sanitize returned an empty result.");
        return;
      }
      setSanitizeResult({
        side: isClaimant ? "claimant" : "respondent",
        sanitized: data.sanitized || "",
        removed: data.removed || [],
        note: data.note || "",
      });
      // Pull the layout's token-balance and audit-trail in line with the
      // server side state so the user sees the deduction immediately
      // instead of having to reload the page.
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Sanitize failed.");
    } finally {
      setSanitizing(false);
    }
  }

  function applySanitizeResult() {
    if (!sanitizeResult) return;
    if (sanitizeResult.side === "claimant") {
      setClaimantStatement(sanitizeResult.sanitized);
    } else {
      setRespondentStatement(sanitizeResult.sanitized);
    }
    setSanitizeResult(null);
  }

  async function removeStatementFile() {
    if (!confirm("Remove the attached statement document?")) return;
    setStatementError(null);
    setStatementSaving(true);
    try {
      const isClaimant = detail.role === "claimant";
      const isRespondent = detail.role === "respondent";
      if (!isClaimant && !isRespondent) return;
      const text = (isClaimant ? claimantStatement : respondentStatement) ?? "";
      await postStatementUpdate({ statement: text, removeAttachment: true });
      router.refresh();
    } catch (err) {
      setStatementError(err instanceof Error ? err.message : "Failed to remove document.");
    } finally {
      setStatementSaving(false);
    }
  }

  function renderStatementSection(side: "claimant" | "respondent") {
    const isClaimantSide = side === "claimant";
    const eyebrow = isClaimantSide ? "Claimant statement" : "Respondent statement";
    const eyebrowClass = isClaimantSide ? "text-rose-600" : "text-indigo-600";
    const sideName = isClaimantSide ? detail.case.claimantName : detail.case.respondentName;
    const value = isClaimantSide ? claimantStatement : respondentStatement;
    const setValue = isClaimantSide ? setClaimantStatement : setRespondentStatement;
    const original = (isClaimantSide
      ? detail.case.claimantStatement
      : detail.case.respondentStatement) ?? "";
    const canEdit = detail.role === side;
    const placeholder = isClaimantSide
      ? "State the claim against the respondent here. Plain language is fine."
      : "Write your response to the claimant's statement here.";
    const dirty = canEdit && (value ?? "") !== original;

    const fileUrl = isClaimantSide
      ? detail.case.claimantStatementFileUrl
      : detail.case.respondentStatementFileUrl;
    const fileName = isClaimantSide
      ? detail.case.claimantStatementFileName
      : detail.case.respondentStatementFileName;
    const downloadHref = fileUrl
      ? (`/api/files/case/${detail.case.id}?asset=${side}-statement` as Route)
      : null;
    const translationUrl = isClaimantSide
      ? detail.case.claimantStatementFileTranslationUrl
      : detail.case.respondentStatementFileTranslationUrl;
    const translationName = isClaimantSide
      ? detail.case.claimantStatementFileTranslationName
      : detail.case.respondentStatementFileTranslationName;
    const translationLang = isClaimantSide
      ? detail.case.claimantStatementFileTranslationLang
      : detail.case.respondentStatementFileTranslationLang;
    const translationHref = translationUrl
      ? (`/api/files/case/${detail.case.id}?asset=${side}-statement-translation` as Route)
      : null;
    const caseLanguage = (detail.case.language || "en").toLowerCase();
    const sourceLanguageMatchesCase =
      translationLang && translationLang === caseLanguage;

    return (
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}>
              {eyebrow}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{sideName || "—"}</div>
          </div>
          {canEdit ? (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Editable — this is your side
            </span>
          ) : null}
        </div>

        {canEdit ? (
          <textarea
            value={value ?? ""}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            rows={10}
            className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm leading-7"
          />
        ) : original.trim().length === 0 && !downloadHref ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            {isClaimantSide
              ? "The claimant has not posted a statement yet."
              : "The respondent has not posted a response yet."}
          </div>
        ) : original.trim().length > 0 ? (
          <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-7 text-slate-700">
            {original}
          </div>
        ) : null}

        {downloadHref ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <svg
                className="h-4 w-4 text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6"
                />
              </svg>
              <span className="font-medium text-slate-700">
                Original: {fileName || "statement document"}
              </span>
              <Link
                href={downloadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:border-slate-400"
              >
                View
              </Link>
              <a
                href={`${downloadHref}${(downloadHref as string).includes("?") ? "&" : "?"}download=1` as Route}
                download={fileName || "statement.pdf"}
                className="rounded-md bg-ink px-2 py-0.5 font-medium text-white hover:bg-slate-800"
              >
                Download
              </a>
              {canEdit ? (
                <button
                  type="button"
                  disabled={statementSaving || statementUploading}
                  onClick={() => void removeStatementFile()}
                  className="rounded-md border border-rose-300 px-2 py-0.5 font-medium text-rose-700 hover:border-rose-400 disabled:opacity-60"
                >
                  Remove
                </button>
              ) : null}
            </div>

            {/* Translation row — either show the existing translated doc or
                offer to produce one. Either party can translate either side's
                document; cost is on the requester. */}
            {translationHref ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs">
                <span className="font-medium text-emerald-800">
                  Translation ({(translationLang || "?").toUpperCase()}):{" "}
                  {translationName || "translated.pdf"}
                </span>
                <Link
                  href={translationHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 font-medium text-emerald-800 hover:border-emerald-400"
                >
                  View
                </Link>
                <a
                  href={`${translationHref}${(translationHref as string).includes("?") ? "&" : "?"}download=1` as Route}
                  download={translationName || "translated.pdf"}
                  className="rounded-md bg-emerald-700 px-2 py-0.5 font-medium text-white hover:bg-emerald-800"
                >
                  Download
                </a>
                {!sourceLanguageMatchesCase ? (
                  <button
                    type="button"
                    disabled={translatingDoc !== null}
                    onClick={() => void runTranslateDocument(side)}
                    className="rounded-md border border-emerald-300 px-2 py-0.5 font-medium text-emerald-800 hover:border-emerald-400 disabled:opacity-60"
                  >
                    {translatingDoc === side
                      ? "Re-translating..."
                      : `Re-translate to ${caseLanguage.toUpperCase()}`}
                  </button>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                disabled={translatingDoc !== null}
                onClick={() => void runTranslateDocument(side)}
                title={`Translate the attached document to ${caseLanguage.toUpperCase()} via DeepL — formatting is preserved.`}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-400 disabled:opacity-60"
              >
                {translatingDoc === side
                  ? `Translating to ${caseLanguage.toUpperCase()}... (this can take ~30s)`
                  : `Translate document to ${caseLanguage.toUpperCase()} (${ACTION_COSTS.document_translate} tokens)`}
              </button>
            )}
          </div>
        ) : null}

        {/* Text translation result, shown inline below the statement display */}
        {translationResult && translationResult.side === side ? (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-800">
                Translation{" "}
                {translationResult.detectedSourceLang
                  ? `${translationResult.detectedSourceLang} → ${translationResult.targetLang.toUpperCase()}`
                  : `→ ${translationResult.targetLang.toUpperCase()}`}{" "}
                (DeepL)
              </div>
              <button
                type="button"
                onClick={() => setTranslationResult(null)}
                className="text-xs text-slate-600 underline hover:text-slate-800"
              >
                Hide
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded-md bg-white p-3 leading-7 text-slate-800">
              {translationResult.text}
            </div>
          </div>
        ) : null}

        {/* Translate-text button — both sides see this on the OTHER party's
            section to read in their case language, plus on their own if the
            language doesn't match. */}
        {original.trim().length > 0 ? (
          <button
            type="button"
            disabled={translating !== null}
            onClick={() => void runTranslateText(side)}
            title={`Translate the saved statement text to ${caseLanguage.toUpperCase()} via DeepL.`}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-400 disabled:opacity-60"
          >
            {translating === side
              ? "Translating..."
              : `Translate text to ${caseLanguage.toUpperCase()} (${ACTION_COSTS.statement_translate} tokens)`}
          </button>
        ) : null}

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={statementFileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadStatementFile(file);
                }}
              />
              <button
                type="button"
                disabled={statementSaving || statementUploading}
                onClick={() => statementFileInputRef.current?.click()}
                title="Supported formats: PDF, Word DOC/DOCX. The AI clean-up reads PDF + DOCX directly."
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {statementUploading
                  ? "Uploading..."
                  : downloadHref
                    ? "Replace document (PDF / DOC / DOCX)"
                    : "Attach document (PDF / DOC / DOCX)"}
              </button>
              {(() => {
                const hasSavedText = original.trim().length > 0;
                const hasAttached = !!fileUrl;
                const canRun = hasSavedText || hasAttached;
                const tipText = !canRun
                  ? "Save your statement (text or document) first, then run AI clean-up."
                  : !hasSavedText && hasAttached
                    ? "AI will read the attached document directly. PDFs are supported; for other formats, paste the text into the field instead."
                    : "AI strips out passages outside DIN.ORG arbitration scope (criminal, injunctions, etc.).";
                return (
                  <button
                    type="button"
                    disabled={statementSaving || statementUploading || sanitizing || !canRun}
                    onClick={() => void runSanitize()}
                    title={tipText}
                    className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:border-violet-400 disabled:opacity-60"
                  >
                    {sanitizing
                      ? "AI cleaning up..."
                      : `Clean up for arbitration scope (${ACTION_COSTS.statement_sanitize} tokens)`}
                  </button>
                );
              })()}
              <span className="text-xs text-slate-500">
                {dirty ? "Unsaved text changes." : "Up to date."}
              </span>
            </div>
            <button
              type="button"
              disabled={statementSaving || statementUploading || !dirty}
              onClick={() => void saveStatement()}
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {statementSaving ? "Saving..." : isClaimantSide ? "Save claim" : "Save response"}
            </button>
          </div>
        ) : null}

        {canEdit && sanitizeResult && sanitizeResult.side === side ? (
          <div className="space-y-4 rounded-md border border-violet-200 bg-violet-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                  AI clean-up suggestion
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {sanitizeResult.note ||
                    "The AI removed passages outside DIN.ORG arbitration scope."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSanitizeResult(null)}
                className="text-xs font-medium text-slate-600 underline hover:text-slate-800"
              >
                Discard
              </button>
            </div>

            {sanitizeResult.sanitized.trim() ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">Suggested cleaned text</div>
                <div className="whitespace-pre-wrap rounded-md border border-violet-200 bg-white p-3 text-sm leading-7 text-slate-800">
                  {sanitizeResult.sanitized}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                The AI found nothing in scope for DIN.ORG arbitration. Review the removed
                passages below — you may need to file in a court instead, or rephrase the
                statement around a civil claim.
              </div>
            )}

            {sanitizeResult.removed.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Removed or rewritten ({sanitizeResult.removed.length})
                </div>
                <ul className="space-y-2">
                  {sanitizeResult.removed.map((entry, idx) => (
                    <li
                      key={idx}
                      className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-6"
                    >
                      <div className="text-slate-700">
                        <span className="font-semibold text-rose-700">Removed:</span>{" "}
                        <em>{entry.passage}</em>
                      </div>
                      <div className="mt-1 text-slate-600">
                        <span className="font-semibold">Reason:</span> {entry.reason}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {sanitizeResult.sanitized.trim() ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applySanitizeResult}
                  className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                >
                  Apply to text field
                </button>
                <span className="text-xs text-slate-500">
                  You will still need to click <strong>Save</strong> after applying.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {canEdit && statementError ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {statementError}
          </div>
        ) : null}
      </section>
    );
  }

  function renderClaimsAndDefenses() {
    return (
      <div className="space-y-6">
        {renderStatementSection("claimant")}
        {renderStatementSection("respondent")}
      </div>
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
            ? "lg:grid-cols-[248px_minmax(0,1fr)_360px]"
            : "lg:grid-cols-[248px_minmax(0,1fr)]"
        }`}
      >
        <aside className="lg:sticky lg:top-0 lg:h-screen lg:self-start lg:overflow-y-auto border-r border-slate-200 bg-white p-3 lg:pt-[68px]">
          <div role="tablist" aria-label="Case workspace sections" className="space-y-4">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              role="tab"
              id="tab-overview"
              aria-selected={activeTab === "overview"}
              aria-controls="panel-overview"
              className={`block min-h-[104px] w-full rounded-lg px-3 py-3 text-left transition ${
                activeTab === "overview"
                  ? "bg-ink text-white shadow-sm"
                  : "bg-slate-100 text-ink hover:bg-slate-200"
              }`}
            >
              <div className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${
                activeTab === "overview" ? "text-white/60" : "text-slate-500"
              }`}>
                Case
              </div>
              <div className="mt-1 line-clamp-3 text-sm font-semibold leading-snug">
                {detail.case.title}
              </div>
              <div className={`mt-2 text-xs ${activeTab === "overview" ? "text-white/65" : "text-slate-500"}`}>
                {detail.case.caseNumber}
              </div>
            </button>

            {CASE_NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.items.map((key) => {
                    if (!VISIBLE_TAB_KEYS.has(key)) return null;
                    const tab = tabs.find((item) => item.key === key);
                    if (!tab) return null;
                    const needsAttention = !!tabAttention[tab.key];
                    const isActive = activeTab === tab.key;
                    const count = tabCounts[tab.key as keyof typeof tabCounts] || 0;
                    const tabClass = isActive
                      ? "bg-ink text-white"
                      : needsAttention
                        ? "bg-amber-50 text-amber-950 ring-1 ring-amber-200 hover:bg-amber-100"
                        : "text-slate-600 hover:bg-slate-100 hover:text-ink";
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        role="tab"
                        id={`tab-${tab.key}`}
                        aria-selected={isActive}
                        aria-controls={`panel-${tab.key}`}
                        className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition ${tabClass}`}
                      >
                        <span className="truncate">{tab.label}</span>
                        {count > 0 ? (
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${
                            isActive ? "bg-white/15 text-white" : needsAttention ? "bg-amber-200/70 text-amber-950" : "bg-slate-200 text-slate-700"
                          }`}>
                            {count}
                          </span>
                        ) : needsAttention ? (
                          <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-white" : "bg-amber-500"}`} aria-hidden="true" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {detail.role === "moderator" ? (
              <Link
                href={`/cases/${detail.case.id}/edit` as Route}
                className="block rounded-md border border-slate-200 px-4 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
              <div className="rounded-md bg-slate-50 p-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Case language
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Drives AI outputs, notification emails, and document translations.
                    </div>
                  </div>
                  {detail.role === "claimant" || detail.role === "respondent" ? (
                    <select
                      value={caseLang}
                      disabled={caseLangSaving}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCaseLang(next);
                        void saveCaseLanguage(next);
                      }}
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="en">English</option>
                      <option value="de">Deutsch</option>
                      <option value="fr">Français</option>
                      <option value="es">Español</option>
                      <option value="it">Italiano</option>
                      <option value="pt">Português</option>
                      <option value="nl">Nederlands</option>
                      <option value="pl">Polski</option>
                    </select>
                  ) : (
                    <span className="text-sm font-semibold uppercase text-slate-900">
                      {(detail.case.language || "en").toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
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
          <AdditionalPartiesSection
            caseId={detail.case.id}
            caseRole={detail.role}
            side="claimant"
            parties={detail.parties as any}
            viewerPartyId={detail.viewerPartyId ?? null}
          />
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
          <AdditionalPartiesSection
            caseId={detail.case.id}
            caseRole={detail.role}
            side="respondent"
            parties={detail.parties as any}
            viewerPartyId={detail.viewerPartyId ?? null}
          />
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
            if (role === "claimant" && !claimantHasStatement) {
              items.push({ key: "submit-claim", label: "Post your claim statement", tab: "claims" });
            }
            if (role === "respondent" && !respondentHasStatement) {
              items.push({ key: "submit-response", label: "Post your response", tab: "claims" });
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

            // Discovery readiness handshake: when every review item is settled
            // and the viewing party has not yet confirmed they're ready for
            // the hearing, show a To-do nudge that opens the Hearing tab.
            const evidenceSettled = detail.evidence.every((e) => {
              const state = String((e as any).reviewState || "pending").toLowerCase();
              if (state !== "pending") return true;
              const deadline = (e as any).discussionDeadline;
              if (!deadline) return false;
              const d = new Date(deadline);
              return !Number.isNaN(d.getTime()) && new Date() > d;
            });
            const witnessSettled = detail.witnesses.every(
              (w) => String((w as any).status || "").toLowerCase() !== "pending",
            );
            const expertiseSettled = detail.expertiseRequests.every((er) => {
              const s = String((er as any).status || "").toLowerCase();
              return s !== "draft" && s !== "generating";
            });
            const tasksSettledForReady = evidenceSettled && witnessSettled && expertiseSettled;
            const claimantReady = !!(detail.case as any).discoveryReadyClaimantAt;
            const respondentReady = !!(detail.case as any).discoveryReadyRespondentAt;
            if (tasksSettledForReady) {
              if (role === "claimant" && !claimantReady) {
                items.push({
                  key: "discovery-ready-c",
                  label: "Confirm: I'm ready for the hearing",
                  tab: "hearing",
                });
              }
              if (role === "respondent" && !respondentReady) {
                items.push({
                  key: "discovery-ready-r",
                  label: "Confirm: I'm ready for the hearing",
                  tab: "hearing",
                });
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
          <PleadingsPanel
            caseId={detail.case.id}
            caseRole={detail.role}
            caseLanguage={detail.case.language || "en"}
            claimantName={detail.case.claimantName}
            respondentName={detail.case.respondentName}
            pleadings={detail.pleadings ?? []}
          />
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

      {activeTab === "lawyers" ? (
        <div id="panel-lawyers" role="tabpanel" aria-labelledby="tab-lawyers">
          <LawyersPanel
            caseId={detail.case.id}
            caseRole={detail.role}
            canContribute={detail.role !== "moderator" && detail.role !== "admin"}
            lawyers={detail.lawyers as any}
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
        <div id="panel-hearing" role="tabpanel" aria-labelledby="tab-hearing" className="space-y-4">
          <ScriptedHearingPanel
            caseId={detail.case.id}
            caseRole={detail.role}
            claimantKycVerified={detail.claimantKyc?.status === "verified"}
            respondentKycVerified={detail.respondentKyc?.status === "verified"}
          />

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
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">DIN.ORG Guide</div>
                <p className="mt-3 text-sm text-slate-300">
                  Pick a counsel persona to enable the DIN.ORG Guide.
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
