import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  caseActivities,
  caseMessages,
  cases,
  consultants,
  evidence,
  expertiseRequests,
  kycVerifications,
  users,
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
  evidenceReviewActionSchema,
  expertiseCreateSchema,
  hearingScheduleSchema,
  caseContactsUpdateSchema,
  messageCreateSchema,
  witnessCreateSchema,
} from "@/contracts/cases";
import {
  EVIDENCE_REVIEW_EXTENSION_COSTS,
  EVIDENCE_REVIEW_EXTENSION_DAYS,
  EVIDENCE_REVIEW_MAX_EXTENSIONS,
} from "@/server/billing/config";
import { spendForAction } from "@/server/billing/service";
import { assertAppUserActive } from "@/server/auth/provision";
import { isUserKycVerified } from "@/server/identity/service";
import { sendRespondentNotifyEmail } from "@/server/email/respondent-notify";
import { sendWitnessInvitationEmail, sendConsultantInvitationEmail } from "@/server/email/witness-notify";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";

type AppUser = ProvisionedAppUser | null;

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export type ActivityActor = {
  user: AppUser;
  impersonation: ImpersonationContext | null;
};

const SYSTEM_ACTOR: ActivityActor = { user: null, impersonation: null };

type AuthorizedCase = {
  case: typeof cases.$inferSelect;
  role: "claimant" | "respondent" | "moderator";
  impersonation: ImpersonationContext | null;
};

async function getVerifiedClaimantEnrichment(userId: string | null | undefined) {
  if (!userId) return null;
  const db = getDb();
  const rows = await db
    .select({
      kycId: users.kycVerificationId,
      kycStatus: kycVerifications.status,
      firstName: kycVerifications.verifiedFirstName,
      lastName: kycVerifications.verifiedLastName,
    })
    .from(users)
    .leftJoin(kycVerifications, eq(users.kycVerificationId, kycVerifications.id))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.kycStatus !== "verified") {
    return { kycVerificationId: row.kycId ?? null, verifiedName: null as string | null };
  }
  const verifiedName = `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
  return {
    kycVerificationId: row.kycId ?? null,
    verifiedName: verifiedName.length > 0 ? verifiedName : null,
  };
}

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
  actor: ActivityActor,
) {
  const db = getDb();

  await db.insert(caseActivities).values({
    caseId,
    type,
    title,
    description,
    performedBy: formatPerformedBy(actor.user, actor.impersonation),
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

  // KYC gate: if trying to file without verification, persist as draft so the
  // user can resume after completing verification, then signal the gate.
  const needsKycGate =
    parsed.saveMode === "file" && user.id && !(await isUserKycVerified(user.id));

  const saveMode = needsKycGate ? "draft" : parsed.saveMode;
  const enrichment = await getVerifiedClaimantEnrichment(user?.id);
  const verifiedName = enrichment?.verifiedName ?? null;

  const inserted = await db
    .insert(cases)
    .values({
      caseNumber: generateCaseNumber(),
      title: buildCaseTitle(parsed.claimantName, parsed.respondentName),
      description: parsed.description,
      category: parsed.category,
      priority: parsed.priority,
      status: saveMode === "file" ? "filed" : "draft",
      filingDate: saveMode === "file" ? new Date() : null,
      claimantName: parsed.claimantName,
      claimantEmail: parsed.claimantEmail,
      claimantPhone: parsed.claimantPhone || null,
      claimantUserId: user?.id ?? null,
      claimantKycVerificationId: enrichment?.kycVerificationId ?? null,
      claimantNameVerified: verifiedName,
      respondentName: parsed.respondentName,
      respondentEmail: parsed.respondentEmail,
      respondentPhone: parsed.respondentPhone || null,
      respondentNameAlleged: parsed.respondentName,
      respondentEmailAlleged: parsed.respondentEmail,
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
    saveMode === "file" ? "filing" : "note",
    saveMode === "file" ? "Case filed" : "Draft created",
    parsed.description,
    { user, impersonation: null },
  );

  if (saveMode === "file" && verifiedName) {
    await createCaseActivity(
      caseItem.id,
      "identity_verified",
      "Claimant identity verified",
      `Filed by verified user ${verifiedName}.`,
      SYSTEM_ACTOR,
    );
  }

  if (needsKycGate) {
    const err = new Error("KYC_REQUIRED") as Error & { draftCaseId?: string };
    err.draftCaseId = caseItem.id;
    throw err;
  }

  return caseItem;
}

export async function updateCase(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = caseMutationSchema.parse(payload);

  // KYC gate: if trying to file without verification, save the edits as a draft
  // so nothing is lost, then signal the gate.
  const needsKycGate =
    parsed.saveMode === "file" && !!user?.id && !(await isUserKycVerified(user.id));

  const db = getDb();
  const effectiveSaveMode = needsKycGate ? "draft" : parsed.saveMode;
  const status = effectiveSaveMode === "file" ? "filed" : authorized.case.status;

  const actingUserIsClaimant =
    !!user?.id && authorized.case.claimantUserId === user.id;
  const enrichment = actingUserIsClaimant
    ? await getVerifiedClaimantEnrichment(user!.id)
    : null;
  const verifiedName = enrichment?.verifiedName ?? null;
  const isTransitioningToFiled = status === "filed" && authorized.case.status !== "filed";

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
      claimantUserId: authorized.case.claimantUserId ?? user?.id ?? null,
      claimantKycVerificationId: enrichment?.kycVerificationId ?? authorized.case.claimantKycVerificationId ?? null,
      claimantNameVerified: verifiedName ?? authorized.case.claimantNameVerified ?? null,
      respondentName: parsed.respondentName,
      respondentEmail: parsed.respondentEmail,
      respondentPhone: parsed.respondentPhone || null,
      respondentNameAlleged: authorized.case.respondentNameAlleged ?? parsed.respondentName,
      respondentEmailAlleged: authorized.case.respondentEmailAlleged ?? parsed.respondentEmail,
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
    { user, impersonation: authorized.impersonation },
  );

  if (isTransitioningToFiled && verifiedName) {
    await createCaseActivity(
      caseId,
      "identity_verified",
      "Claimant identity verified",
      `Filed by verified user ${verifiedName}.`,
      SYSTEM_ACTOR,
    );
  }

  if (needsKycGate) {
    const err = new Error("KYC_REQUIRED") as Error & { draftCaseId?: string };
    err.draftCaseId = caseId;
    throw err;
  }

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

  const reviewDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

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
      discussionDeadline: reviewDeadline,
      reviewState: "pending",
      reviewExtensions: 0,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "evidence_submitted",
    "Evidence submitted",
    parsed.title,
    { user, impersonation: authorized.impersonation },
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
    idempotencyKey: `witness:${caseId}:${parsed.fullName}:${parsed.email}`,
    metadata: { fullName: parsed.fullName },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(witnesses)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone || null,
      relationship: parsed.relationship || null,
      statement: parsed.statement || null,
      statementFileUrl: parsed.attachment?.url ?? null,
      statementFilePathname: parsed.attachment?.pathname ?? null,
      photoUrl: parsed.photo?.url ?? null,
      photoPathname: parsed.photo?.pathname ?? null,
      calledBy: authorized.role,
      notes: parsed.notes || null,
      status: "pending",
      invitationToken: token,
      invitationTokenExpiresAt: expiresAt,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "witness_added",
    "Witness added",
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
  );

  // Send invitation email
  const calledByPartyName =
    authorized.role === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : authorized.case.respondentName || "the respondent";

  try {
    await sendWitnessInvitationEmail(parsed.email, {
      witnessName: parsed.fullName,
      calledByPartyName,
      token,
    });
  } catch (err) {
    console.error("Failed to send witness invitation email:", err);
  }

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
    idempotencyKey: `consultant:${caseId}:${parsed.fullName}:${parsed.email}`,
    metadata: { fullName: parsed.fullName },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(consultants)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email,
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
      invitationToken: token,
      invitationTokenExpiresAt: expiresAt,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Consultant added",
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
  );

  // Send invitation email
  const calledByPartyName =
    authorized.role === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : authorized.case.respondentName || "the respondent";

  try {
    await sendConsultantInvitationEmail(parsed.email, {
      consultantName: parsed.fullName,
      calledByPartyName,
      token,
    });
  } catch (err) {
    console.error("Failed to send consultant invitation email:", err);
  }

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

export async function resendWitnessInvitation(user: AppUser, caseId: string, witnessId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const rows = await db.select().from(witnesses).where(and(eq(witnesses.id, witnessId), eq(witnesses.caseId, caseId))).limit(1);
  const witness = rows[0];
  if (!witness) {
    throw new Error("Witness not found");
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(witnesses)
    .set({ invitationToken: token, invitationTokenExpiresAt: expiresAt })
    .where(eq(witnesses.id, witnessId));

  const calledByPartyName =
    witness.calledBy === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : witness.calledBy === "respondent"
        ? authorized.case.respondentName || "the respondent"
        : "the arbitrator";

  await sendWitnessInvitationEmail(witness.email, {
    witnessName: witness.fullName,
    calledByPartyName,
    token,
  });

  return { success: true };
}

export async function resendConsultantInvitation(user: AppUser, caseId: string, consultantId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const rows = await db.select().from(consultants).where(and(eq(consultants.id, consultantId), eq(consultants.caseId, caseId))).limit(1);
  const consultant = rows[0];
  if (!consultant) {
    throw new Error("Consultant not found");
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(consultants)
    .set({ invitationToken: token, invitationTokenExpiresAt: expiresAt })
    .where(eq(consultants.id, consultantId));

  const calledByPartyName =
    consultant.calledBy === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : consultant.calledBy === "respondent"
        ? authorized.case.respondentName || "the respondent"
        : "the arbitrator";

  await sendConsultantInvitationEmail(consultant.email, {
    consultantName: consultant.fullName,
    calledByPartyName,
    token,
  });

  return { success: true };
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

  await createCaseActivity(
    caseId,
    "note",
    "Expertise request created",
    parsed.title,
    { user, impersonation: authorized.impersonation },
  );

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

  await createCaseActivity(
    caseId,
    "message",
    "Message sent",
    parsed.content.slice(0, 120),
    { user, impersonation: authorized.impersonation },
  );

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
    { user, impersonation: authorized.impersonation },
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
    { user, impersonation: authorized.impersonation },
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
    { user, impersonation: authorized.impersonation },
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
    { user, impersonation: authorized.impersonation },
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
    { user, impersonation: authorized.impersonation },
  );

  return updated[0];
}

function isOpposingRole(reviewerRole: string, submittedBy: string | null) {
  if (!submittedBy) return false;
  if (reviewerRole === "claimant") return submittedBy === "respondent";
  if (reviewerRole === "respondent") return submittedBy === "claimant";
  return false;
}

export async function reviewEvidence(
  user: AppUser,
  caseId: string,
  evidenceId: string,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const reviewerRole = authorized.role;
  if (reviewerRole !== "claimant" && reviewerRole !== "respondent") {
    throw new Error("Only the opposing party can review evidence");
  }

  const parsed = evidenceReviewActionSchema.parse(payload);
  const db = getDb();

  const rows = await db
    .select()
    .from(evidence)
    .where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseId)))
    .limit(1);
  const record = rows[0];
  if (!record) {
    throw new Error("Evidence not found");
  }
  if (!isOpposingRole(reviewerRole, record.submittedBy)) {
    throw new Error("Only the opposing party can review this evidence");
  }

  const now = new Date();
  const expired = record.discussionDeadline ? now > record.discussionDeadline : false;
  const currentState = record.reviewState || "pending";
  const isOpen = currentState === "pending" && !expired;

  if (parsed.action === "accept") {
    if (!isOpen) throw new Error("Review window is closed");
    const updated = await db
      .update(evidence)
      .set({
        reviewState: "accepted",
        status: "accepted",
        updatedAt: now,
      })
      .where(eq(evidence.id, evidenceId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      "Evidence accepted",
      record.title,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  if (parsed.action === "dismiss") {
    if (!isOpen) throw new Error("Review window is closed");
    const updated = await db
      .update(evidence)
      .set({
        reviewState: "dismissed",
        status: "rejected",
        rejectedBy: reviewerRole,
        reviewDismissalReason: parsed.reason,
        reviewDismissalFileUrl: parsed.attachment?.url ?? null,
        reviewDismissalFilePathname: parsed.attachment?.pathname ?? null,
        reviewDismissalFileName: parsed.attachment?.fileName ?? null,
        updatedAt: now,
      })
      .where(eq(evidence.id, evidenceId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      "Evidence dismissed",
      `${record.title}: ${parsed.reason}`,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  if (parsed.action === "extend") {
    if (currentState !== "pending") throw new Error("Review window is closed");
    const used = record.reviewExtensions ?? 0;
    if (used >= EVIDENCE_REVIEW_MAX_EXTENSIONS) {
      throw new Error("No more extensions available; evidence will be presented as is.");
    }
    const next = used + 1;
    const actionCode = (`evidence_review_extend_${next}` as
      | "evidence_review_extend_1"
      | "evidence_review_extend_2"
      | "evidence_review_extend_3");
    const spend = await spendForAction(user, {
      actionCode,
      caseId,
      idempotencyKey: `evidence_review_extend:${evidenceId}:${next}`,
      metadata: { evidenceId, extension: next },
    });
    if (!spend.success) {
      throw new Error(spend.error || "Insufficient tokens");
    }
    const baseDeadline = record.discussionDeadline && record.discussionDeadline > now
      ? record.discussionDeadline
      : now;
    const newDeadline = new Date(
      baseDeadline.getTime() + EVIDENCE_REVIEW_EXTENSION_DAYS * 24 * 60 * 60 * 1000,
    );
    const updated = await db
      .update(evidence)
      .set({
        reviewExtensions: next,
        discussionDeadline: newDeadline,
        updatedAt: now,
      })
      .where(eq(evidence.id, evidenceId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      `Evidence review extended (#${next})`,
      `${record.title}: cost ${EVIDENCE_REVIEW_EXTENSION_COSTS[next - 1]} tokens`,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  if (parsed.action === "request_expertise") {
    if (!isOpen) throw new Error("Review window is closed");
    const spend = await spendForAction(user, {
      actionCode: "expertise_create",
      caseId,
      idempotencyKey: `evidence_expertise:${evidenceId}`,
      metadata: { evidenceId },
    });
    if (!spend.success) {
      throw new Error(spend.error || "Insufficient tokens");
    }
    const expertise = await db
      .insert(expertiseRequests)
      .values({
        caseId,
        requestedBy: reviewerRole,
        title: parsed.title || `AI expertise on evidence: ${record.title}`,
        description:
          parsed.description ||
          `Requested by ${reviewerRole} during evidence review window. Evidence id: ${evidenceId}.`,
        fileReferences: record.fileUrl
          ? ([
              {
                url: record.fileUrl,
                pathname: record.filePathname,
                fileName: record.fileName,
                contentType: record.contentType,
              } as Record<string, unknown>,
            ])
          : null,
        status: "draft",
      })
      .returning();
    const updated = await db
      .update(evidence)
      .set({
        reviewState: "expertise_requested",
        status: "under_review",
        reviewExpertiseRequestId: expertise[0].id,
        updatedAt: now,
      })
      .where(eq(evidence.id, evidenceId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      "AI expertise requested",
      record.title,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  throw new Error("Unsupported action");
}
