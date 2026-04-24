import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { caseAudits, cases, lawyerConversations, simulations } from "@/db/schema";
import { auditRequestSchema, lawyerChatMessageSchema } from "@/contracts/ai";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { generateStructuredObject, isAiConfigured } from "@/server/ai/service";
import { getAuthorizedCase, createCaseActivity } from "@/server/cases/mutations";
import { getCaseDetail } from "@/server/cases/queries";

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
  claimant_perspective: z.string(),
  respondent_perspective: z.string(),
  common_ground: z.array(z.string()).min(2).max(6),
  settlement_proposal: z.string(),
  settlement_amount: z.number().nonnegative(),
  rationale: z.string(),
  next_steps: z.array(z.string()).min(2).max(5),
});

const judgementOutputSchema = z.object({
  summary: z.string(),
  claims_analysis: z.array(
    z.object({
      claim: z.string(),
      finding: z.string(),
      reasoning: z.string(),
    }),
  ).min(1).max(8),
  evidence_assessment: z.string(),
  prevailing_party: z.enum(["claimant", "respondent", "split"]),
  judgement_summary: z.string(),
  remedies_ordered: z.array(z.string()).min(1).max(6),
  award_amount: z.number().nonnegative(),
  detailed_rationale: z.string(),
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
      title: item.title,
      type: item.type,
      description: item.description,
      status: item.status,
      notes: item.notes,
    })),
    witnesses: detail.witnesses.map((item) => ({
      fullName: item.fullName,
      relationship: item.relationship,
      statement: item.statement,
      status: item.status,
    })),
    consultants: detail.consultants.map((item) => ({
      fullName: item.fullName,
      company: item.company,
      expertise: item.expertise,
      role: item.role,
      report: item.report,
      status: item.status,
    })),
    expertiseRequests: detail.expertiseRequests.map((item) => ({
      title: item.title,
      description: item.description,
      status: item.status,
    })),
    messages: detail.messages.slice(0, 8).map((item) => ({
      senderRole: item.senderRole,
      senderName: item.senderName,
      content: item.content,
      createdAt: item.createdAt,
    })),
  };
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
      title: parsed.title || `${requestedSide[0].toUpperCase()}${requestedSide.slice(1)} audit`,
      snapshotJson: snapshot,
      auditJson: audit,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "AI audit generated",
    `Generated ${requestedSide} audit.`,
    { user, impersonation },
  );

  return inserted[0];
}

export async function generateArbitrationProposal(user: AppUser, caseId: string) {
  ensureAiReady();
  const { detail, impersonation } = await getAiContext(user, caseId);
  const db = getDb();

  const prompt = [
    "You are a neutral arbitration settlement analyst.",
    "Review both parties' positions and draft a balanced settlement proposal.",
    "Focus on realistic common ground and practical next steps.",
    "Use only the supplied case context.",
    "",
    "Case context:",
    toJsonSafe(compactCaseContext(detail)),
  ].join("\n");

  const proposal = await generateStructuredObject(prompt, arbitrationOutputSchema);

  const updated = await db
    .update(cases)
    .set({
      status: "in_arbitration",
      arbitrationProposalJson: proposal,
      settlementAmount: proposal.settlement_amount.toString(),
      finalDecision: null,
      arbitrationClaimantResponse: null,
      arbitrationRespondentResponse: null,
    })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "decision",
    "Arbitration proposal generated",
    proposal.settlement_proposal,
    { user, impersonation },
  );

  return updated[0];
}

export async function acceptArbitrationProposal(user: AppUser, caseId: string, claimantResponse?: "accepted" | "rejected", respondentResponse?: "accepted" | "rejected") {
  const { authorized, detail, impersonation } = await getAiContext(user, caseId);
  const proposal = detail.case.arbitrationProposalJson;

  if (!proposal || typeof proposal !== "object") {
    throw new Error("No arbitration proposal is available yet.");
  }

  const userRole = authorized.role;

  const summary =
    typeof proposal.settlement_proposal === "string"
      ? proposal.settlement_proposal
      : "AI arbitration proposal accepted.";
  const amount =
    typeof proposal.settlement_amount === "number" || typeof proposal.settlement_amount === "string"
      ? proposal.settlement_amount.toString()
      : null;

  const db = getDb();

  const updateData: any = {
    status: "resolved",
    finalDecision: summary,
    settlementAmount: amount,
  };

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

  await createCaseActivity(
    caseId,
    "decision",
    "Arbitration proposal accepted",
    summary,
    { user, impersonation },
  );

  return updated[0];
}

export async function rejectArbitrationProposal(user: AppUser, caseId: string, note?: string, claimantResponse?: "accepted" | "rejected", respondentResponse?: "accepted" | "rejected") {
  const { authorized, impersonation } = await getAiContext(user, caseId);
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


  const updated = await db
    .update(cases)
    .set(updateData)
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "status_change",
    "Arbitration proposal rejected",
    note || `${userRole} rejected the arbitration proposal.`,
    { user, impersonation },
  );

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
    "You are an arbitrator preparing a formal judgement.",
    "Weigh the claims, evidence, and procedural record fairly.",
    "Use only the case context provided here.",
    "",
    "Case context:",
    toJsonSafe(compactCaseContext(detail)),
  ].join("\n");

  const judgement = await generateStructuredObject(prompt, judgementOutputSchema);

  // Build update data - always clear simulation data for single AI judgement
  const updateData: any = {
    status: "awaiting_decision",
    judgementJson: judgement,
    settlementAmount: judgement.award_amount.toString(),
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

  await createCaseActivity(
    caseId,
    "decision",
    clearSimulationData ? "Single AI judgement generated" : "Judgement generated",
    judgement.summary,
    { user, impersonation },
  );

  return updated[0];
}

export async function acceptJudgement(user: AppUser, caseId: string) {

  const { authorized, detail, impersonation } = await getAiContext(user, caseId);

  assertModerator(authorized.role);
  const judgement = detail.case.judgementJson;

  if (!judgement || typeof judgement !== "object") {
    throw new Error("No judgement is available yet.");
  }

  const summary =
    typeof judgement.judgement_summary === "string"
      ? judgement.judgement_summary
      : "Judgement accepted.";
  const amount =
    typeof judgement.award_amount === "number" || typeof judgement.award_amount === "string"
      ? judgement.award_amount.toString()
      : null;
  const prevailing =
    typeof judgement.prevailing_party === "string" ? judgement.prevailing_party : "The decision";

  // Construct final decision text properly for all prevailing_party values
  let finalDecisionText: string;
  if (prevailing === "split") {
    finalDecisionText = `No prevailing party determined. ${summary}`;
  } else {
    finalDecisionText = `${prevailing} prevails. ${summary}`;
  }

  const db = getDb();

  const updated = await db
    .update(cases)
    .set({
      status: "resolved",
      finalDecision: finalDecisionText,
      settlementAmount: amount,
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

  await createCaseActivity(
    caseId,
    "decision",
    "Judgement accepted",
    summary,
    { user, impersonation },
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
