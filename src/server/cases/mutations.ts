import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  caseActivities,
  caseMessages,
  cases,
  consultants,
  evidence,
  expertiseRequests,
  witnesses,
  hearings,
} from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import {
  getImpersonationContext,
  formatPerformedBy,
  type ImpersonationContext,
} from "@/server/auth/impersonation";
import {
  caseMutationSchema,
  caseClaimsUpdateSchema,
  caseLawyerSelectionSchema,
  consultantCreateSchema,
  evidenceCreateSchema,
  expertiseCreateSchema,
  hearingScheduleSchema,
  caseContactsUpdateSchema,
  messageCreateSchema,
  witnessCreateSchema,
} from "@/contracts/cases";
import { spendForAction } from "@/server/billing/service";
import { assertAppUserActive } from "@/server/auth/provision";
import { sendRespondentNotifyEmail } from "@/server/email/respondent-notify";
import { randomUUID } from "crypto";

type AppUser = ProvisionedAppUser | null;

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

type AuthorizedCase = {
  case: typeof cases.$inferSelect;
  role: "claimant" | "respondent" | "moderator";
  impersonation: ImpersonationContext | null;
};

export async function getAuthorizedCase(user: AppUser, caseId: string): Promise<AuthorizedCase | null> {
  assertAppUserActive(user);
  if (!user) {
    return null;
  }

  const db = getDb();
  const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = rows[0];

  if (!caseItem) {
    return null;
  }

  const impersonation = await getImpersonationContext(user, caseId);
  if (impersonation) {
    return {
      case: caseItem,
      role: impersonation.role,
      impersonation,
    };
  }

  const userEmail = normalizeEmail(user.email);
  const claimant = normalizeEmail(caseItem.claimantEmail) === userEmail;
  const respondent = normalizeEmail(caseItem.respondentEmail) === userEmail;
  const moderator =
    user.role === "admin" ||
    user.role === "moderator" ||
    (user.id ? caseItem.arbitratorAssignedUserId === user.id : false);

  if (!claimant && !respondent && !moderator) {
    return null;
  }

  return {
    case: caseItem,
    role: claimant ? "claimant" : respondent ? "respondent" : "moderator",
    impersonation: null,
  };
}

export async function createCaseActivity(
  caseId: string,
  type: typeof caseActivities.$inferInsert.type,
  title: string,
  description: string,
  performedBy: string,
) {
  const db = getDb();

  await db.insert(caseActivities).values({
    caseId,
    type,
    title,
    description,
    performedBy,
  });
}

function buildCaseTitle(claimantName: string, respondentName: string) {
  return `${claimantName} vs ${respondentName}`;
}

function generateCaseNumber() {
  const year = new Date().getFullYear();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ARB-${year}-${suffix}`;
}

export async function createCase(user: AppUser, payload: unknown) {
  assertAppUserActive(user);

  const parsed = caseMutationSchema.parse(payload);
  const db = getDb();

  const inserted = await db
    .insert(cases)
    .values({
      caseNumber: generateCaseNumber(),
      title: buildCaseTitle(parsed.claimantName, parsed.respondentName),
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      status: parsed.saveMode === "file" ? "filed" : "draft",
      filingDate: parsed.saveMode === "file" ? new Date() : null,
      claimantName: parsed.claimantName,
      claimantEmail: parsed.claimantEmail,
      claimantPhone: parsed.claimantPhone || null,
      respondentName: parsed.respondentName,
      respondentEmail: parsed.respondentEmail,
      respondentPhone: parsed.respondentPhone || null,
      claimAmount: parsed.claimAmount?.toString(),
      currency: parsed.currency,
      claimantClaims: parsed.claimantClaims,
      respondentClaims: parsed.respondentClaims,
      claimantLawyerKey: parsed.claimantLawyerKey || null,
    })
    .returning();

  const caseItem = inserted[0];
  await createCaseActivity(
    caseItem.id,
    parsed.saveMode === "file" ? "filing" : "note",
    parsed.saveMode === "file" ? "Case filed" : "Draft created",
    parsed.description,
    user.fullName || user.email,
  );

  return caseItem;
}

export async function updateCase(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = caseMutationSchema.parse(payload);
  const db = getDb();
  const status = parsed.saveMode === "file" ? "filed" : authorized.case.status;

  const updated = await db
    .update(cases)
    .set({
      title: buildCaseTitle(parsed.claimantName, parsed.respondentName),
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      status,
      filingDate:
        status === "filed" && !authorized.case.filingDate ? new Date() : authorized.case.filingDate,
      claimantName: parsed.claimantName,
      claimantEmail: parsed.claimantEmail,
      claimantPhone: parsed.claimantPhone || null,
      respondentName: parsed.respondentName,
      respondentEmail: parsed.respondentEmail,
      respondentPhone: parsed.respondentPhone || null,
      claimAmount: parsed.claimAmount?.toString(),
      currency: parsed.currency,
      claimantClaims: parsed.claimantClaims,
      respondentClaims: parsed.respondentClaims,
      claimantLawyerKey: parsed.claimantLawyerKey || authorized.case.claimantLawyerKey,
    })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "status_change",
    "Case updated",
    "Case details updated in the rewrite workspace.",
    formatPerformedBy(user, authorized.impersonation),
  );

  return updated[0];
}

export async function createEvidence(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = evidenceCreateSchema.parse(payload);
  const db = getDb();
  const spendResult = await spendForAction(user, {
    actionCode: "evidence_create",
    caseId,
    idempotencyKey: `evidence:${caseId}:${parsed.title}:${parsed.type}`,
    metadata: { title: parsed.title, type: parsed.type },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidence)
    .where(eq(evidence.caseId, caseId));

  const inserted = await db
    .insert(evidence)
    .values({
      caseId,
      evidenceNumber: (countRows[0]?.count ?? 0) + 1,
      title: parsed.title,
      description: parsed.description || null,
      type: parsed.type,
      status: "pending",
      submittedBy: authorized.role === "moderator" ? "arbitrator" : authorized.role,
      notes: parsed.notes || null,
      fileUrl: parsed.attachment?.url ?? null,
      filePathname: parsed.attachment?.pathname ?? null,
      fileName: parsed.attachment?.fileName ?? null,
      contentType: parsed.attachment?.contentType ?? null,
      fileSize: parsed.attachment?.size ?? null,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "evidence_submitted",
    "Evidence submitted",
    parsed.title,
    formatPerformedBy(user, authorized.impersonation),
  );

  return inserted[0];
}

export async function deleteEvidence(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db.delete(evidence).where(and(eq(evidence.id, recordId), eq(evidence.caseId, caseId)));
}

export async function createWitness(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = witnessCreateSchema.parse(payload);
  const db = getDb();
  const spendResult = await spendForAction(user, {
    actionCode: "witness_create",
    caseId,
    idempotencyKey: `witness:${caseId}:${parsed.fullName}:${parsed.email || ""}`,
    metadata: { fullName: parsed.fullName },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }
  const inserted = await db
    .insert(witnesses)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      relationship: parsed.relationship || null,
      statement: parsed.statement || null,
      statementFileUrl: parsed.attachment?.url ?? null,
      statementFilePathname: parsed.attachment?.pathname ?? null,
      calledBy: authorized.role,
      notes: parsed.notes || null,
      status: "pending",
    })
    .returning();

  await createCaseActivity(caseId, "witness_added", "Witness added", parsed.fullName, formatPerformedBy(user, authorized.impersonation));

  return inserted[0];
}

export async function deleteWitness(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db.delete(witnesses).where(and(eq(witnesses.id, recordId), eq(witnesses.caseId, caseId)));
}

export async function createConsultant(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = consultantCreateSchema.parse(payload);
  const db = getDb();
  const spendResult = await spendForAction(user, {
    actionCode: "consultant_create",
    caseId,
    idempotencyKey: `consultant:${caseId}:${parsed.fullName}:${parsed.email || ""}`,
    metadata: { fullName: parsed.fullName },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }
  const inserted = await db
    .insert(consultants)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email || null,
      phone: parsed.phone || null,
      company: parsed.company || null,
      expertise: parsed.expertise || null,
      role: parsed.role || null,
      report: parsed.report || null,
      reportFileUrl: parsed.attachment?.url ?? null,
      reportFilePathname: parsed.attachment?.pathname ?? null,
      calledBy: authorized.role,
      notes: parsed.notes || null,
      status: "pending",
    })
    .returning();

  await createCaseActivity(caseId, "note", "Consultant added", parsed.fullName, formatPerformedBy(user, authorized.impersonation));

  return inserted[0];
}

export async function deleteConsultant(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db.delete(consultants).where(and(eq(consultants.id, recordId), eq(consultants.caseId, caseId)));
}

export async function createExpertise(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = expertiseCreateSchema.parse(payload);
  const db = getDb();
  const spendResult = await spendForAction(user, {
    actionCode: "expertise_create",
    caseId,
    idempotencyKey: `expertise:${caseId}:${parsed.title}`,
    metadata: { title: parsed.title },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }
  const inserted = await db
    .insert(expertiseRequests)
    .values({
      caseId,
      requestedBy: authorized.role,
      title: parsed.title,
      description: parsed.description,
      fileReferences: parsed.attachments,
      status: "draft",
    })
    .returning();

  await createCaseActivity(caseId, "note", "Expertise request created", parsed.title, formatPerformedBy(user, authorized.impersonation));

  return inserted[0];
}

export async function deleteExpertise(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db
    .delete(expertiseRequests)
    .where(and(eq(expertiseRequests.id, recordId), eq(expertiseRequests.caseId, caseId)));
}

export async function createMessage(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = messageCreateSchema.parse(payload);
  const db = getDb();
  const senderRole = authorized.role === "moderator" ? "arbitrator" : authorized.role;

  const inserted = await db
    .insert(caseMessages)
    .values({
      caseId,
      senderRole,
      senderName: user?.fullName || user?.email || "Unknown sender",
      content: parsed.content,
      attachmentUrl: parsed.attachment?.url ?? null,
      attachmentPathname: parsed.attachment?.pathname ?? null,
      attachmentName: parsed.attachment?.fileName ?? null,
    })
    .returning();

  await createCaseActivity(caseId, "message", "Message sent", parsed.content.slice(0, 120), formatPerformedBy(user, authorized.impersonation));

  return inserted[0];
}

export async function getLatestCaseActivity(caseId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(caseActivities)
    .where(eq(caseActivities.caseId, caseId))
    .orderBy(desc(caseActivities.createdAt))
    .limit(8);

  return rows;
}

export async function updateCaseClaims(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = caseClaimsUpdateSchema.parse(payload);
  const db = getDb();
  const updated = await db
    .update(cases)
    .set({
      claimantClaims: parsed.claimantClaims,
      respondentClaims: parsed.respondentClaims,
    })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Claims updated",
    "Claim and response details were updated.",
    formatPerformedBy(user, authorized.impersonation),
  );

  return updated[0];
}

export async function selectCaseLawyer(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = caseLawyerSelectionSchema.parse(payload);
  if (parsed.side !== authorized.role) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const updated = await db
    .update(cases)
    .set(
      parsed.side === "claimant"
        ? { claimantLawyerKey: parsed.lawyerKey }
        : { respondentLawyerKey: parsed.lawyerKey },
    )
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Lawyer selected",
    `${parsed.side} selected lawyer ${parsed.lawyerKey}.`,
    formatPerformedBy(user, authorized.impersonation),
  );

  return updated[0];
}

export async function notifyRespondent(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role !== "claimant") {
    throw new Error("Forbidden");
  }

  const respondentEmail = authorized.case.respondentEmail?.trim();
  if (!respondentEmail) {
    throw new Error("This case has no respondent email; add one before notifying.");
  }

  await sendRespondentNotifyEmail(respondentEmail, {
    id: authorized.case.id,
    title: authorized.case.title,
    caseNumber: authorized.case.caseNumber,
    claimantName: authorized.case.claimantName,
    respondentName: authorized.case.respondentName,
  });

  await createCaseActivity(
    caseId,
    "other",
    "Defendant notified",
    `Respondent notified by email at ${respondentEmail}.`,
    formatPerformedBy(user, authorized.impersonation),
  );

  return { success: true };
}

export async function updateCaseContacts(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role !== "claimant") {
    throw new Error("Forbidden");
  }

  const parsed = caseContactsUpdateSchema.parse(payload);
  const db = getDb();

  const updated = await db
    .update(cases)
    .set({
      claimantName: parsed.claimantName,
      claimantEmail: parsed.claimantEmail,
      claimantPhone: parsed.claimantPhone || null,
      respondentName: parsed.respondentName,
      respondentEmail: parsed.respondentEmail,
      respondentPhone: parsed.respondentPhone || null,
      title: buildCaseTitle(parsed.claimantName, parsed.respondentName),
    })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "status_change",
    "Contacts updated",
    "Claimant updated party contact information.",
    formatPerformedBy(user, authorized.impersonation),
  );

  return updated[0];
}

export async function scheduleHearing(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role !== "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = hearingScheduleSchema.parse(payload);
  const db = getDb();
  
  // Create hearing record
  const hearingId = randomUUID();
  await db.insert(hearings).values({
    id: hearingId,
    caseId,
    scheduledStartTime: new Date(parsed.hearingDate),
    scheduledEndTime: parsed.endTime ? new Date(parsed.endTime) : null,
    meetingUrl: parsed.meetingUrl || null,
    meetingPlatform: 'google_meet',
    meetingId: parsed.meetingId || null,
    status: 'scheduled',
    phase: 'pre_hearing',
    isRecording: 'false',
    isTranscribing: 'true',
    autoTranscribe: 'true',
  });

  // Update case with arbitrator and status
  const updated = await db
    .update(cases)
    .set({
      status: "hearing_scheduled",
      arbitratorAssignedName: parsed.arbitrator,
    })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "hearing_scheduled",
    "Hearing scheduled",
    `${parsed.arbitrator} scheduled a hearing for ${parsed.hearingDate}.`,
    formatPerformedBy(user, authorized.impersonation),
  );

  return updated[0];
}
