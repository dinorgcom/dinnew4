import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { caseAudits, cases, lawyerConversations, simulations } from "@/db/schema";
import { auditRequestSchema, lawyerChatMessageSchema } from "@/contracts/ai";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { generateStructuredObject, isAiConfigured } from "@/server/ai/service";
import { getAuthorizedCase, createCaseActivity, recordCaseAuditEvent } from "@/server/cases/mutations";
import { getCaseDetail } from "@/server/cases/queries";
import { spendForAction } from "@/server/billing/service";
import {
  assertRequiredPartyHearingsComplete,
  getCompletedHearingContextForArbitration,
} from "@/server/cases/scripted-hearings";
import { notifyCaseEvent } from "@/server/notifications/service";

type AppUser = ProvisionedAppUser | null;

const auditOutputSchema = z.object({
  executive_summary: z.string(),
  strengths: z.array(z.string()).min(3).max(6),
  weaknesses: z.array(z.string()).min(3).max(6),
  evidence_assessment: z.array(
    z.object({
      title: z.string(),
      relevance: z.string(),
      concern: z.string(),
    }),
  ).min(1).max(8),
  missing_information: z.array(z.string()).min(2).max(6),
  recommended_next_steps: z.array(z.string()).min(3).max(6),
  overall_readiness: z.enum(["low", "moderate", "strong"]),
});

const arbitrationOutputSchema = z.object({
  LIABILITY: z.enum(["claimant", "respondent", "none"]),
  RANGE_LOW: z.number().nonnegative(),
  RANGE_HIGH: z.number().nonnegative(),
  RATIONALE: z.string(),
}).superRefine((value, ctx) => {
  if (value.RANGE_LOW > value.RANGE_HIGH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RANGE_LOW must be less than or equal to RANGE_HIGH.",
      path: ["RANGE_LOW"],
    });
  }
  if (value.LIABILITY === "none" && (value.RANGE_LOW !== 0 || value.RANGE_HIGH !== 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "No-liability proposals must use a zero range.",
      path: ["LIABILITY"],
    });
  }
});

const judgementOutputSchema = z.object({
  LIABILITY: z.enum(["claimant", "respondent", "none"]),
  DAMAGES_AWARDED: z.number().nonnegative(),
  RATIONALE: z.string(),
}).superRefine((value, ctx) => {
  if (value.LIABILITY === "none" && value.DAMAGES_AWARDED !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "No-liability rulings must award zero damages.",
      path: ["LIABILITY"],
    });
  }
});

const lawyerReplySchema = z.object({
  reply: z.string(),
  context_summary: z.string(),
});

type LawyerMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

function ensureAiReady() {
  if (!isAiConfigured()) {
    throw new Error("AI providers are not configured yet.");
  }
}

function toJsonSafe(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function compactCaseContext(detail: NonNullable<Awaited<ReturnType<typeof getCaseDetail>>>) {
  return {
    case: {
      id: detail.case.id,
      caseNumber: detail.case.caseNumber,
      title: detail.case.title,
      description: detail.case.description,
      category: detail.case.category,
      status: detail.case.status,
      priority: detail.case.priority,
      claimAmount: detail.case.claimAmount,
      currency: detail.case.currency,
      claimantName: detail.case.claimantName,
      respondentName: detail.case.respondentName,
      claimantClaims: detail.case.claimantClaims,
      respondentClaims: detail.case.respondentClaims,
      finalDecision: detail.case.finalDecision,
      arbitrationProposalJson: detail.case.arbitrationProposalJson,
      judgementJson: detail.case.judgementJson,
    },
    evidence: detail.evidence.map((item) => ({
      id: item.id,
      evidenceNumber: item.evidenceNumber,
      title: item.title,
      type: item.type,
      description: item.description,
      status: item.status,
      submittedBy: item.submittedBy,
      fileName: item.fileName,
      discussion: item.discussion,
      notes: item.notes,
    })),
    witnesses: detail.witnesses.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      relationship: item.relationship,
      calledBy: item.calledBy,
      statement: item.statement,
      status: item.status,
      notes: item.notes,
      discussion: item.discussion,
    })),
    consultants: detail.consultants.map((item) => ({
      id: item.id,
      fullName: item.fullName,
      company: item.company,
      expertise: item.expertise,
      role: item.role,
      calledBy: item.calledBy,
      report: item.report,
      status: item.status,
      notes: item.notes,
      discussion: item.discussion,
    })),
    expertiseRequests: detail.expertiseRequests.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      requestedBy: item.requestedBy,
      aiAnalysis: item.aiAnalysis,
      status: item.status,
    })),
    messages: detail.messages.slice(0, 8).map((item) => ({
      id: item.id,
      senderRole: item.senderRole,
      senderName: item.senderName,
      content: item.content,
      createdAt: item.createdAt,
    })),
  };
}

function toFiniteNonnegativeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function formatCurrencyRange(low: number | null, high: number | null) {
  const format = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);

  if (low === null || high === null) return "the proposed range";
  if (low === high) return format(low);
  return `${format(low)}-${format(high)}`;
}

function applyArbitrationProposalOverrides(
  proposal: Record<string, unknown>,
  rangeLowUsd?: number | null,
  rangeHighUsd?: number | null,
  rationaleText?: string | null,
) {
  const next = { ...proposal };
  if (typeof rangeLowUsd === "number" && Number.isFinite(rangeLowUsd) && rangeLowUsd >= 0) {
    next.RANGE_LOW = rangeLowUsd;
  }
  if (typeof rangeHighUsd === "number" && Number.isFinite(rangeHighUsd) && rangeHighUsd >= 0) {
    next.RANGE_HIGH = rangeHighUsd;
  }
  if (typeof rationaleText === "string" && rationaleText.length > 0) {
    next.RATIONALE = rationaleText;
  }

  const low = toFiniteNonnegativeNumber(next.RANGE_LOW);
  const high = toFiniteNonnegativeNumber(next.RANGE_HIGH);
  if (low !== null && high !== null && low > high) {
    throw new Error("Range low cannot exceed range high.");
  }

  return next;
}

function arbitrationProposalAmount(proposal: Record<string, unknown>) {
  return toFiniteNonnegativeNumber(proposal.RANGE_HIGH ?? proposal.settlement_amount);
}

function summarizeArbitrationProposal(proposal: Record<string, unknown>) {
  const liability = proposal.LIABILITY;
  const low = toFiniteNonnegativeNumber(proposal.RANGE_LOW);
  const high = toFiniteNonnegativeNumber(proposal.RANGE_HIGH);
  if (liability === "none") {
    return "No net payment is proposed.";
  }
  if (liability === "claimant") {
    return `Claimant should pay respondent ${formatCurrencyRange(low, high)}.`;
  }
  if (liability === "respondent") {
    return `Respondent should pay claimant ${formatCurrencyRange(low, high)}.`;
  }
  if (typeof proposal.settlement_proposal === "string") {
    return proposal.settlement_proposal;
  }
  return "AI arbitration proposal accepted.";
}

function judgementAmount(judgement: Record<string, unknown>) {
  return toFiniteNonnegativeNumber(judgement.DAMAGES_AWARDED ?? judgement.award_amount);
}

function summarizeJudgement(judgement: Record<string, unknown>) {
  const liability = judgement.LIABILITY;
  const amount = judgementAmount(judgement);
  const amountText =
    amount !== null
      ? new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(amount)
      : "the awarded amount";

  if (liability === "none") {
    return "No net payment is awarded.";
  }
  if (liability === "claimant") {
    return `Claimant must pay respondent ${amountText}.`;
  }
  if (liability === "respondent") {
    return `Respondent must pay claimant ${amountText}.`;
  }
  if (typeof judgement.judgement_summary === "string") {
    return judgement.judgement_summary;
  }
  if (typeof judgement.summary === "string") {
    return judgement.summary;
  }
  return "Judgement accepted.";
}

async function getAiContext(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const detail = await getCaseDetail(user, caseId);
  if (!detail) {
    throw new Error("Case not found");
  }

  return { authorized, detail, impersonation: authorized.impersonation };
}

export async function listCaseAudits(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  return db.select().from(caseAudits).where(eq(caseAudits.caseId, caseId)).orderBy(desc(caseAudits.createdAt));
}

export async function deleteAudit(user: AppUser, caseId: string, auditId: string) {
  const { authorized, impersonation } = await getAiContext(user, caseId);
  assertModerator(authorized.role);

  const db = getDb();
  const deleted = await db
    .delete(caseAudits)
    .where(and(eq(caseAudits.id, auditId), eq(caseAudits.caseId, caseId)))
    .returning();

  if (deleted.length === 0) {
    throw new Error("Audit not found");
  }

  await createCaseActivity(caseId, "note", "Audit deleted", `Audit "${deleted[0].title || 'Untitled'}" was deleted`, { user, impersonation });
  return deleted[0];
}

export async function requestAudit(user: AppUser, caseId: string, payload: unknown) {
  ensureAiReady();
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  const parsed = auditRequestSchema.parse(payload);
  const spend = await spendForAction(user, {
    actionCode: "audit_request",
    caseId,
    idempotencyKey: `audit:${caseId}:${user?.id ?? "anon"}:${Date.now()}`,
    metadata: { side: parsed.side ?? authorized.role },
  });
  if (!spend.success) {
    throw new Error(spend.error || "Insufficient tokens");
  }
  const db = getDb();
  const actorName = user?.fullName || user?.email || "Unknown user";
  const requestedSide =
    authorized.role === "claimant" || authorized.role === "respondent" ? authorized.role : parsed.side;
  const snapshot = {
    perspective: requestedSide,
    generatedBy: actorName,
    generatedAt: new Date().toISOString(),
    context: compactCaseContext(detail),
  };

  const prompt = [
    "You are an arbitration case analyst.",
    `Assess the case strictly from the ${requestedSide} perspective.`,
    "Identify the strongest support, the biggest gaps, and the most actionable next steps.",
    "Use only the supplied case context and do not invent evidence.",
    "",
    "Case context:",
    toJsonSafe(snapshot.context),
  ].join("\n");

  const audit = await generateStructuredObject(prompt, auditOutputSchema);
  const inserted = await db
    .insert(caseAudits)
    .values({
      caseId,
      requestedByUserId: user?.id ?? null,
      requestedByRole: authorized.role,
      requestedAt: new Date(),
      title: parsed.title || `${requestedSide[0].toUpperCase()}${requestedSide.slice(1)} summary`,
      snapshotJson: snapshot,
      auditJson: audit,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "AI summary generated",
    `Generated ${requestedSide} summary.`,
    { user, impersonation },
  );

  return inserted[0];
}

export async function generateArbitrationProposal(
  user: AppUser,
  caseId: string,
  rangeLowUsd?: number | null,
  rangeHighUsd?: number | null,
  rationaleText?: string | null,
) {
  ensureAiReady();
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  await assertRequiredPartyHearingsComplete(caseId);
  const hearingContext = await getCompletedHearingContextForArbitration(caseId);
  const db = getDb();

  const prompt = [
    "You are an impartial AI arbitration judge. Your task is to produce a neutral arbitration proposal, and where the case file requires it, a proposed ruling.",
    "",
    "You are not an advocate for either party. Apply the governing arbitration agreement, applicable substantive law, applicable procedural rules, and the record provided. Do not prefer either claimant or respondent because of role, size, sophistication, tone, or volume of submissions.",
    "",
    "The current runtime does not provide external legal research tools. Use internal legal reasoning and the supplied case record only. If the relevant law, legal standard, or damages methodology is unclear, state the uncertainty in the rationale and avoid pretending certainty. Do not invent legal authorities, citations, facts, evidence, or procedural history.",
    "",
    "INPUT CASE MATERIALS MAY INCLUDE:",
    "- Arbitration agreement and governing-law clause, if available",
    "- Claimant's claims",
    "- Claimant's submitted evidence",
    "- Discussion, objections, and contests relating to claimant's evidence",
    "- Respondent's claims, defenses, and counterclaims",
    "- Respondent's submitted evidence",
    "- Discussion, objections, and contests relating to respondent's evidence",
    "- Witness statements, if any",
    "- Expert testimony, if any",
    "- Hearing transcripts",
    "- Any admitted procedural orders or party stipulations",
    "",
    "METHOD:",
    "1. Read the full case record before deciding.",
    "2. Identify the governing law, legal standards, burden of proof, and damages standard.",
    "3. Build a neutral chronology of material facts.",
    "4. Identify each claim, defense, counterclaim, and requested remedy.",
    "5. For each claim or defense, analyze each required legal element, the party bearing the burden, supporting evidence, opposing evidence, and whether the element is proven, not proven, or uncertain.",
    "6. Evaluate important evidence item by item for what fact it tends to prove, authenticity/reliability, whether it was contested, whether counterevidence was submitted, and weight assigned.",
    "7. If a party contests evidence but submits no meaningful counterevidence where counterevidence would reasonably be expected, consider whether an adverse evidentiary inference is appropriate. Treat this as a credibility/procedural-conduct factor only. Do not label conduct fraudulent unless the record independently proves fraud under the applicable legal standard.",
    "8. Assess witness and expert material for opportunity to observe, consistency, bias or interest, methodology, assumptions, and expertise.",
    "9. Decide liability first, including percentage allocation if fault, causation, mitigation, contributory fault, or comparative responsibility applies.",
    "10. Decide damages second. Exclude unsupported, speculative, legally unavailable, or duplicative amounts. Apply mitigation, causation, offsets, caps, limits, interest, fees, or costs only where legally justified by the record.",
    "11. Net all allowed claims, counterclaims, offsets, and allocations into one non-negative payment range owed by the net payer to the other party.",
    "12. Explain the result clearly in markdown inside RATIONALE.",
    "",
    "MANDATORY PRIVATE REVIEW BEFORE OUTPUT:",
    "Before producing the final JSON, perform a private self-critique and correction pass. Do not include the private critique in the final JSON unless its conclusions are relevant to RATIONALE.",
    "Check completeness across all claims, defenses, counterclaims, offsets, evidence contests, witnesses, experts, transcript admissions, governing law, procedure, burden of proof, limitation periods, damages rules, mitigation, interest, costs, and contractual caps.",
    "Challenge your conclusion from claimant's and respondent's strongest opposing arguments. Check whether you unfairly discounted or over-credited evidence, drew adverse inferences too quickly, shifted the burden incorrectly, double-counted damages or offsets, or chose a range too narrow or broad for the uncertainty.",
    "Privately rate confidence in liability allocation, damages range, legal-rule accuracy, and evidence assessment. If any confidence score is below 7, correct the draft by widening the range, reducing certainty, removing unsupported findings, flagging uncertainty, or changing the conclusion.",
    "",
    "OUTPUT RULES:",
    "Return only the structured JSON object requested by the schema. RANGE_LOW and RANGE_HIGH must be numbers, not strings. If no net payment is owed, set LIABILITY to \"none\", RANGE_LOW to 0, and RANGE_HIGH to 0.",
    "LIABILITY identifies the net payer: \"respondent\" means respondent pays claimant; \"claimant\" means claimant pays respondent; \"none\" means no net payment.",
    "",
    "RATIONALE must include these markdown sections:",
    "# Arbitration Proposal",
    "## Decision Summary",
    "## Governing Standard",
    "## Claims and Defenses",
    "## Evidence Assessment",
    "## Liability Allocation",
    "## Damages Calculation",
    "## Net Range",
    "## Settlement Offer",
    "## Confidence and Gaps",
    "",
    "QUALITY CONSTRAINTS:",
    "- Be fair, neutral, and restrained.",
    "- Separate proven facts from allegations.",
    "- Separate legal conclusions from credibility judgments.",
    "- Do not overstate certainty.",
    "- Do not claim external legal verification because this runtime has no research tools.",
    "- Prefer the parties' contract, arbitration rules, and supplied record over assumptions.",
    "- Do not punish a party merely for contesting evidence; only draw adverse inferences when the contest is unsupported, material, and the missing counterevidence would reasonably be expected.",
    "- If critical information is missing, still produce the best-supported range from the record and explain the uncertainty in RATIONALE.",
    "",
    "Case context:",
    toJsonSafe({
      ...compactCaseContext(detail),
      scriptedHearing: hearingContext,
    }),
  ].join("\n");

  const proposal = await generateStructuredObject(prompt, arbitrationOutputSchema);
  const finalProposal = applyArbitrationProposalOverrides(proposal, rangeLowUsd, rangeHighUsd, rationaleText);
  const finalAmount = arbitrationProposalAmount(finalProposal);
  const summary = summarizeArbitrationProposal(finalProposal);

  const updated = await db
    .update(cases)
    .set({
      status: "in_arbitration",
      arbitrationProposalJson: finalProposal,
      settlementAmount: finalAmount !== null ? finalAmount.toString() : null,
      finalDecision: null,
      arbitrationClaimantResponse: null,
      arbitrationRespondentResponse: null,
    })
    .where(eq(cases.id, caseId))
    .returning();

  await recordCaseAuditEvent(
    caseId,
    "decision",
    "Arbitration proposal generated",
    summary,
    { user, impersonation },
    {
      eventKey: "arbitration_requested",
      actorRole: authorized.role,
      entityType: "case",
      entityId: caseId,
      outcome: "proposal_generated",
    },
  );

  await notifyCaseEvent(caseId, "settlement_proposed", {
    title: "A settlement offer has been proposed",
    body: summary,
    actor: user?.fullName || user?.email || authorized.role,
  });

  return updated[0];
}

export async function acceptArbitrationProposal(
  user: AppUser,
  caseId: string,
  claimantResponse?: "accepted" | "rejected",
  respondentResponse?: "accepted" | "rejected",
  rangeLowUsd?: number | null,
  rangeHighUsd?: number | null,
  rationaleText?: string | null,
) {
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  const proposal = detail.case.arbitrationProposalJson;

  if (!proposal || typeof proposal !== "object") {
    throw new Error("No arbitration proposal is available yet.");
  }

  const userRole = authorized.role;

  const effectiveProposal = applyArbitrationProposalOverrides(
    proposal as Record<string, unknown>,
    rangeLowUsd,
    rangeHighUsd,
    rationaleText,
  );
  const summary = summarizeArbitrationProposal(effectiveProposal);
  const amount = arbitrationProposalAmount(effectiveProposal);

  const db = getDb();

  const updateData: any = {
    status: "resolved",
    finalDecision: summary,
    settlementAmount: amount !== null ? amount.toString() : null,
  };
  if (effectiveProposal !== proposal) {
    updateData.arbitrationProposalJson = effectiveProposal;
  }

  if (userRole === "claimant") {
    updateData.arbitrationClaimantResponse = claimantResponse || "accepted";
  } else if (userRole === "respondent") {
    updateData.arbitrationRespondentResponse = respondentResponse || "accepted";
  } else {
    throw new Error(`Only claimants and respondents can accept or reject arbitration proposals. Your current role is: ${userRole || 'unknown'}`);
  }


  const updated = await db
    .update(cases)
    .set(updateData)
    .where(eq(cases.id, caseId))
    .returning();

  await recordCaseAuditEvent(
    caseId,
    "decision",
    "Arbitration proposal accepted",
    summary,
    { user, impersonation },
    {
      eventKey: "case_finalized",
      actorRole: userRole,
      entityType: "case",
      entityId: caseId,
      outcome: "settlement_accepted",
    },
  );

  await notifyCaseEvent(caseId, "settlement_decided", {
    title: "Settlement offer accepted",
    body: summary,
    actor: user?.fullName || user?.email || userRole,
  });

  return updated[0];
}

export async function rejectArbitrationProposal(
  user: AppUser,
  caseId: string,
  note?: string,
  claimantResponse?: "accepted" | "rejected",
  respondentResponse?: "accepted" | "rejected",
  rangeLowUsd?: number | null,
  rangeHighUsd?: number | null,
  rationaleText?: string | null,
) {
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  const db = getDb();

  const userRole = authorized.role;
  const updateData: any = {
    status: "awaiting_decision",
  };

  if (userRole === "claimant") {
    updateData.arbitrationClaimantResponse = claimantResponse || "rejected";
  } else if (userRole === "respondent") {
    updateData.arbitrationRespondentResponse = respondentResponse || "rejected";
  } else {
    throw new Error(`Only claimants and respondents can accept or reject arbitration proposals. Your current role is: ${userRole || 'unknown'}`);
  }

  const proposal = detail.case.arbitrationProposalJson;
  if (proposal && typeof proposal === "object") {
    const effectiveProposal = applyArbitrationProposalOverrides(
      proposal as Record<string, unknown>,
      rangeLowUsd,
      rangeHighUsd,
      rationaleText,
    );
    updateData.arbitrationProposalJson = effectiveProposal;
    const amount = arbitrationProposalAmount(effectiveProposal);
    if (amount !== null) {
      updateData.settlementAmount = amount.toString();
    }
  }

  const updated = await db
    .update(cases)
    .set(updateData)
    .where(eq(cases.id, caseId))
    .returning();

  await recordCaseAuditEvent(
    caseId,
    "status_change",
    "Arbitration proposal rejected",
    note || `${userRole} rejected the arbitration proposal.`,
    { user, impersonation },
    {
      eventKey: "settlement_refused",
      actorRole: userRole,
      entityType: "case",
      entityId: caseId,
      outcome: "settlement_rejected",
      note: note || null,
    },
  );

  await notifyCaseEvent(caseId, "settlement_decided", {
    title: "Settlement offer rejected",
    body: note || `${userRole} rejected the proposal. The case will continue.`,
    actor: user?.fullName || user?.email || userRole,
  });

  return updated[0];
}

function assertModerator(role: string) {
  if (role !== "moderator") {
    throw new Error("Moderator access required");
  }
}

export async function generateJudgement(user: AppUser, caseId: string, clearSimulationData: boolean = false, clearDataImmediately: boolean = false) {
  ensureAiReady();
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  assertModerator(authorized.role);
  const db = getDb();

  // Clear data immediately if requested to prevent flicker during refresh
  if (clearDataImmediately) {
    // Clear judgement data from cases table
    await db
      .update(cases)
      .set({
        judgementJson: null,
        finalDecision: null,
        settlementAmount: null,
        currentSimulationId: null,
      })
      .where(eq(cases.id, caseId));
      
    // Delete simulation records for this case
    await db
      .delete(simulations)
      .where(eq(simulations.caseId, caseId));
  }

  const prompt = [
    "You are an impartial AI arbitration judge. The parties failed to settle after the arbitration proposal stage. Your task is now to issue a proposed final ruling.",
    "",
    "You are not an advocate for either party. Apply the governing arbitration agreement, applicable substantive law, applicable procedural rules, and the admitted case record. Do not prefer either claimant or respondent because of role, size, sophistication, tone, or volume of submissions.",
    "",
    "You must decide liability and award a specific damages amount, not a settlement range. If no party owes damages, set LIABILITY to \"none\" and DAMAGES_AWARDED to 0.",
    "",
    "The current runtime does not provide external legal research tools. Use internal legal reasoning and the supplied case record only. If a legal rule materially affects liability or damages but cannot be verified from the case record, reflect that uncertainty in RATIONALE. Do not invent legal authorities, legal citations, facts, evidence, procedural history, exhibit numbers, transcript pages, testimony, expert conclusions, or admissions.",
    "",
    "INPUT CASE MATERIALS MAY INCLUDE:",
    "- Arbitration agreement and governing-law clause, if available",
    "- Prior arbitration proposal, including prior LIABILITY, RANGE_LOW, RANGE_HIGH, and RATIONALE",
    "- Claimant's claims",
    "- Claimant's submitted evidence",
    "- Discussion, objections, and contests relating to claimant's evidence",
    "- Respondent's claims, defenses, and counterclaims",
    "- Respondent's submitted evidence",
    "- Discussion, objections, and contests relating to respondent's evidence",
    "- Witness statements, if any",
    "- Expert testimony, if any",
    "- Hearing transcripts",
    "- Any admitted procedural orders, party stipulations, settlement communications permitted to be considered, and applicable arbitration rules",
    "",
    "CORE DUTY:",
    "Issue a final ruling based only on the record and verified legal standards available in the case context. The prior arbitration proposal is relevant context, but it is not binding. Reconsider the matter independently.",
    "",
    "METHOD:",
    "1. Read the full case record and the prior arbitration proposal before deciding.",
    "2. Identify the governing law, legal standards, burden of proof, damages standard, and any applicable arbitration rules.",
    "3. Build a neutral chronology of material facts.",
    "4. Identify each claim, defense, counterclaim, offset, and requested remedy.",
    "5. For each claim or defense, analyze each required legal element, the party bearing the burden, supporting evidence, opposing evidence, and whether the element is proven, not proven, or uncertain.",
    "6. Evaluate evidence item by item for the fact it tends to prove, whether it exists in the record, its record identifier/title/exhibit number/transcript page/witness name/other precise citation, reliability, whether it was contested, whether counterevidence was submitted, and weight assigned.",
    "7. If a party contests evidence but submits no meaningful counterevidence where counterevidence would reasonably be expected, consider whether an adverse evidentiary inference is appropriate. Treat this as a credibility/procedural-conduct factor only. Do not label conduct fraudulent unless the record independently proves fraud under the applicable legal standard.",
    "8. Assess witness and expert material for opportunity to observe, internal consistency, consistency with documents and other testimony, bias or interest, methodology, assumptions, and expertise.",
    "9. Decide liability, including percentage allocation if fault, causation, mitigation, contributory fault, comparative responsibility, or counterclaims apply.",
    "10. Decide damages by category. Determine legal recoverability and factual proof. Exclude unsupported, speculative, legally unavailable, duplicative, or insufficiently caused amounts. Apply mitigation, causation, offsets, caps, limits, interest, fees, costs, or penalties only where legally justified by the record. Convert the result into one specific net amount.",
    "11. Compare the ruling against the prior arbitration proposal and explain whether the final award falls within, below, or above the prior proposed range. If it differs materially from the prior range or rationale, explain why.",
    "",
    "MANDATORY FACT-CITATION RULE:",
    "Every factual assertion that materially supports liability or damages must cite a specific existing record item from the case context. Acceptable citations include claim ID or claim section, evidence ID/evidence number/title, document title plus page/section where available, hearing transcript page/line or timestamp where available, witness statement name plus paragraph/page where available, expert report name plus paragraph/page where available, party admission, stipulation, procedural order ID, or case message ID.",
    "Before final output, verify that each cited item exists in the provided record, supports the factual statement, and is not overstated. If a citation cannot be verified from the context, remove the factual assertion or rephrase it as an unresolved allegation.",
    "",
    "MANDATORY PRIVATE REVIEW BEFORE OUTPUT:",
    "Before producing the final JSON, perform a private self-critique and correction pass. Do not include this private critique in the final JSON except where its conclusions are relevant to RATIONALE.",
    "Check completeness across all claimant claims and remedies, respondent defenses, claims, counterclaims, offsets, submitted evidence and contests, witnesses, expert testimony, hearing admissions/concessions/contradictions/credibility issues, governing law, procedural rules, burden of proof, limitation periods, damages rules, mitigation, interest, costs, contractual caps, and the prior arbitration proposal.",
    "Check every factual citation for existence, exact support, and non-exaggeration. Remove or correct unsupported factual statements.",
    "Challenge your draft ruling from both sides. Check whether you unfairly discounted or over-credited evidence, drew adverse inferences too quickly, shifted the burden incorrectly, double-counted damages or offsets, awarded unproven damages, or failed to award legally and factually proven damages.",
    "Privately rate confidence in liability decision, damages award, legal-rule accuracy, evidence assessment, and citation accuracy. If any score is below 7, correct the draft by reducing certainty, removing unsupported findings, adjusting damages, flagging legal uncertainty, or changing the conclusion.",
    "",
    "OUTPUT RULES:",
    "Return only the structured JSON object requested by the schema. DAMAGES_AWARDED must be a number, not a string.",
    "LIABILITY is the net payer: use \"claimant\" if claimant must pay respondent, \"respondent\" if respondent must pay claimant, and \"none\" if no net payment is owed.",
    "DAMAGES_AWARDED is the specific net amount awarded from the liable party to the other party. Use 0 if LIABILITY is \"none\".",
    "RATIONALE is a markdown-formatted explanation of the final ruling.",
    "",
    "RATIONALE must include these markdown sections:",
    "# Final Arbitration Ruling",
    "## Decision",
    "## Procedural Posture",
    "## Prior Arbitration Proposal",
    "## Governing Standard",
    "## Claims and Defenses",
    "## Findings of Fact",
    "## Evidence Assessment",
    "## Liability Analysis",
    "## Damages Award",
    "## Confidence and Gaps",
    "",
    "QUALITY CONSTRAINTS:",
    "- Be fair, neutral, and restrained.",
    "- Separate proven facts from allegations.",
    "- Separate legal conclusions from credibility judgments.",
    "- Do not overstate certainty.",
    "- Do not claim external legal verification because this runtime has no research tools.",
    "- Cite factual record items precisely and only when verified from the supplied context.",
    "- Prefer the parties' contract, arbitration rules, and supplied record over assumptions.",
    "- Do not punish a party merely for refusing settlement.",
    "- Do not punish a party merely for contesting evidence; only draw adverse inferences when the contest is unsupported, material, and the missing counterevidence would reasonably be expected.",
    "- If critical information is missing, still issue the best-supported ruling from the record and explain the uncertainty in RATIONALE.",
    "",
    "Case context:",
    toJsonSafe(compactCaseContext(detail)),
  ].join("\n");

  const judgement = await generateStructuredObject(prompt, judgementOutputSchema);

  // Build update data - always clear simulation data for single AI judgement
  const updateData: any = {
    status: "awaiting_decision",
    judgementJson: judgement,
    settlementAmount: judgement.DAMAGES_AWARDED.toString(),
    finalDecision: null, // Only set when judgement is accepted, not during generation
  };

  // Clear simulation data when generating single AI judgement
  if (clearSimulationData) {
    updateData.currentSimulationId = null;
    
    // Delete simulation records for this case
    await db
      .delete(simulations)
      .where(eq(simulations.caseId, caseId));
  }

  const updated = await db
    .update(cases)
    .set(updateData)
    .where(eq(cases.id, caseId))
    .returning();

  await recordCaseAuditEvent(
    caseId,
    "decision",
    clearSimulationData ? "Single AI judgement generated" : "Judgement generated",
    summarizeJudgement(judgement),
    { user, impersonation },
    {
      eventKey: "ruling_requested",
      actorRole: authorized.role,
      entityType: "case",
      entityId: caseId,
      outcome: clearSimulationData ? "single_ai_judgement_generated" : "judgement_generated",
    },
  );

  await notifyCaseEvent(caseId, "judgement_issued", {
    title: "A judgement has been issued",
    body: summarizeJudgement(judgement),
    actor: user?.fullName || user?.email || authorized.role,
  });

  return updated[0];
}

export async function acceptJudgement(user: AppUser, caseId: string) {

  const { authorized, detail, impersonation } = await getAiContext(user, caseId);

  assertModerator(authorized.role);
  const judgement = detail.case.judgementJson;

  if (!judgement || typeof judgement !== "object") {
    throw new Error("No judgement is available yet.");
  }

  const summary = summarizeJudgement(judgement as Record<string, unknown>);
  const amount = judgementAmount(judgement as Record<string, unknown>);
  const finalDecisionText = summary;

  const db = getDb();

  const updated = await db
    .update(cases)
    .set({
      status: "resolved",
      finalDecision: finalDecisionText,
      settlementAmount: amount !== null ? amount.toString() : null,
    })
    .where(eq(cases.id, caseId))
    .returning();

  // Verify the update by querying the database again
  const verificationCase = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

  // Wait a moment and check again to see if something overwrites it
  await new Promise(resolve => setTimeout(resolve, 500));
  const delayedVerification = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

  // If status wasn't updated, try updating it separately
  if (verificationCase[0]?.status !== "resolved") {
    console.log('Status was not updated, attempting separate status update...');
    const statusUpdate = await db
      .update(cases)
      .set({ status: "resolved" })
      .where(eq(cases.id, caseId))
      .returning();
  }

  await recordCaseAuditEvent(
    caseId,
    "decision",
    "Judgement accepted",
    summary,
    { user, impersonation },
    {
      eventKey: "case_finalized",
      actorRole: authorized.role,
      entityType: "case",
      entityId: caseId,
      outcome: "judgement_accepted",
    },
  );

  return updated[0];
}

export async function getLawyerConversation(user: AppUser, caseId: string) {
  const { authorized, impersonation } = await getAiContext(user, caseId);

  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Forbidden");
  }

  const lawyerEmail = impersonation?.targetEmail || user?.email || "";

  const db = getDb();
  const rows = await db
    .select()
    .from(lawyerConversations)
    .where(
      and(
        eq(lawyerConversations.caseId, caseId),
        eq(lawyerConversations.userEmail, lawyerEmail),
      ),
    )
    .orderBy(desc(lawyerConversations.updatedAt))
    .limit(1);

  return rows[0] ?? null;
}

export async function continueLawyerChat(user: AppUser, caseId: string, payload: unknown) {
  ensureAiReady();
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);

  const userRole = authorized.role;
  if (userRole !== "claimant" && userRole !== "respondent") {
    throw new Error("Forbidden");
  }

  const lawyerEmail = impersonation?.targetEmail || user?.email || "";
  const parsed = lawyerChatMessageSchema.parse(payload);
  const db = getDb();
  const existing = await getLawyerConversation(user, caseId);
  const history = Array.isArray(existing?.messagesJson) ? (existing?.messagesJson as LawyerMessage[]) : [];
  const userMessage: LawyerMessage = {
    role: "user",
    content: parsed.message,
    createdAt: new Date().toISOString(),
  };
  const recentHistory = [...history, userMessage].slice(-10);
  const prompt = [
    "You are a practical arbitration lawyer advising a client in an active dispute.",
    `You are speaking to the ${userRole}.`,
    `Your tone should be ${parsed.personality}.`,
    "Give concrete guidance tied to the actual case record. Do not claim certainty where the record is incomplete.",
    "",
    "Case context:",
    toJsonSafe(compactCaseContext(detail)),
    "",
    "Conversation summary:",
    existing?.contextSummary || "No summary yet.",
    "",
    "Recent conversation:",
    toJsonSafe(recentHistory),
  ].join("\n");

  const response = await generateStructuredObject(prompt, lawyerReplySchema);
  const assistantMessage: LawyerMessage = {
    role: "assistant",
    content: response.reply,
    createdAt: new Date().toISOString(),
  };
  const nextMessages = [...history, userMessage, assistantMessage].slice(-20);

  if (existing) {
    const updated = await db
      .update(lawyerConversations)
      .set({
        messagesJson: nextMessages,
        contextSummary: response.context_summary,
        lawyerPersonality: parsed.personality,
        casePhase: detail.case.status,
      })
      .where(eq(lawyerConversations.id, existing.id))
      .returning();

    return updated[0];
  }

  const inserted = await db
    .insert(lawyerConversations)
    .values({
      caseId,
      userId: user?.id ?? null,
      userEmail: lawyerEmail,
      lawyerPersonality: parsed.personality,
      partyRole: userRole,
      messagesJson: nextMessages,
      contextSummary: response.context_summary,
      casePhase: detail.case.status,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Lawyer chat started",
    `${userRole} started an AI counsel thread.`,
    { user, impersonation },
  );

  return inserted[0];
}
