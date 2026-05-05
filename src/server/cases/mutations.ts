import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  caseActivities,
  caseMessages,
  caseParties,
  cases,
  consultants,
  evidence,
  expertiseRequests,
  kycVerifications,
  lawyers,
  users,
  witnesses,
  hearings,
} from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { formatPerformedBy, type ImpersonationContext } from "@/server/auth/impersonation";
import { getAuthorizedCase } from "@/server/cases/access";
import { touchCaseActivity } from "@/server/cases/status";
import {
  caseMutationSchema,
  caseClaimsUpdateSchema,
  caseLanguageUpdateSchema,
  caseStatementUpdateSchema,
  caseLawyerSelectionSchema,
  consultantCreateSchema,
  evidenceCreateSchema,
  evidenceReviewActionSchema,
  expertiseCreateSchema,
  hearingScheduleSchema,
  caseContactsUpdateSchema,
  lawyerCreateSchema,
  messageCreateSchema,
  partyInviteSchema,
  partyVoteSchema,
  recordCommentCreateSchema,
  witnessCreateSchema,
} from "@/contracts/cases";
import {
  EVIDENCE_REVIEW_EXTENSION_COSTS,
  EVIDENCE_REVIEW_EXTENSION_DAYS,
  EVIDENCE_REVIEW_MAX_EXTENSIONS,
  PARTY_APPROVAL_EXTENSION_COSTS,
  PARTY_APPROVAL_EXTENSION_DAYS,
  PARTY_APPROVAL_MAX_EXTENSIONS,
} from "@/server/billing/config";
import { notifyCaseEvent } from "@/server/notifications/service";
import { spendForAction } from "@/server/billing/service";
import { generateStructuredObject } from "@/server/ai/service";
import { translateText, translateDocument } from "@/server/translation/deepl";
import { uploadBlob } from "@/server/blob/service";
import { head } from "@vercel/blob";
import { env } from "@/lib/env";
import { z } from "zod";
import { assertAppUserActive } from "@/server/auth/provision";
import { isUserKycVerified } from "@/server/identity/service";
import { sendRespondentNotifyEmail } from "@/server/email/respondent-notify";
import {
  sendWitnessInvitationEmail,
  sendConsultantInvitationEmail,
  sendLawyerInvitationEmail,
  sendPartyInvitationEmail,
  sendPartyApprovalRequestEmail,
} from "@/server/email/witness-notify";
import { randomUUID } from "crypto";
import { nanoid } from "nanoid";

type AppUser = ProvisionedAppUser | null;

export type ActivityActor = {
  user: AppUser;
  impersonation: ImpersonationContext | null;
};

const SYSTEM_ACTOR: ActivityActor = { user: null, impersonation: null };

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

export { getAuthorizedCase };

export async function createCaseActivity(
  caseId: string,
  type: typeof caseActivities.$inferInsert.type,
  title: string,
  description: string,
  actor: ActivityActor,
  metadataJson?: Record<string, unknown> | null,
) {
  const db = getDb();
  const now = new Date();

  // Always record the auth source (web vs api) so an admin browsing the
  // audit trail can tell programmatic actions apart from human ones.
  const enrichedMetadata: Record<string, unknown> = {
    ...(metadataJson ?? {}),
    authSource: actor.user?.authSource ?? "system",
  };

  await db.insert(caseActivities).values({
    caseId,
    type,
    title,
    description,
    performedBy: formatPerformedBy(actor.user, actor.impersonation),
    metadataJson: enrichedMetadata,
    createdAt: now,
  });
  await touchCaseActivity(caseId, now);
}

export async function recordCaseAuditEvent(
  caseId: string,
  type: typeof caseActivities.$inferInsert.type,
  title: string,
  description: string,
  actor: ActivityActor,
  metadata: {
    eventKey: string;
    entityType?: string;
    entityId?: string;
    entityTitle?: string | null;
    actorRole?: string | null;
    outcome?: string;
    [key: string]: unknown;
  },
) {
  await createCaseActivity(caseId, type, title, description, actor, metadata);
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
      language: (parsed.language || "en").toLowerCase(),
      claimantClaims: parsed.claimantClaims,
      respondentClaims: parsed.respondentClaims,
      claimantStatement: parsed.claimantStatement?.trim() || null,
      respondentStatement: parsed.respondentStatement?.trim() || null,
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
      language: (parsed.language || authorized.case.language || "en").toLowerCase(),
      claimantClaims: parsed.claimantClaims,
      respondentClaims: parsed.respondentClaims,
      claimantStatement:
        parsed.claimantStatement !== undefined
          ? parsed.claimantStatement?.trim() || null
          : authorized.case.claimantStatement,
      respondentStatement:
        parsed.respondentStatement !== undefined
          ? parsed.respondentStatement?.trim() || null
          : authorized.case.respondentStatement,
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
      contextJson: parsed.context ?? null,
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

  await recordCaseAuditEvent(
    caseId,
    "evidence_submitted",
    "Evidence submitted",
    parsed.title,
    { user, impersonation: authorized.impersonation },
    {
      eventKey: "evidence_added",
      actorRole: authorized.role,
      entityType: "evidence",
      entityId: inserted[0].id,
      entityTitle: parsed.title,
    },
  );

  await notifyCaseEvent(caseId, "evidence_added", {
    title: parsed.title,
    body: parsed.description ?? undefined,
    actor: user?.fullName || user?.email || authorized.role,
  });

  return inserted[0];
}

export async function deleteEvidence(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db.delete(evidence).where(and(eq(evidence.id, recordId), eq(evidence.caseId, caseId)));
  await touchCaseActivity(caseId);
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

  const reviewDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(witnesses)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone || null,
      address: parsed.address || null,
      city: parsed.city || null,
      postalCode: parsed.postalCode || null,
      country: parsed.country || null,
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
      discussionDeadline: reviewDeadline,
      reviewState: "pending",
      reviewExtensions: 0,
    })
    .returning();

  await recordCaseAuditEvent(
    caseId,
    "witness_added",
    "Witness added",
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
    {
      eventKey: "witness_added",
      actorRole: authorized.role,
      entityType: "witness",
      entityId: inserted[0].id,
      entityTitle: parsed.fullName,
    },
  );

  await notifyCaseEvent(caseId, "witness_added", {
    title: parsed.fullName,
    body: parsed.statement ?? undefined,
    actor: user?.fullName || user?.email || authorized.role,
  });

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
  await touchCaseActivity(caseId);
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

  const reviewDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(consultants)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone || null,
      address: parsed.address || null,
      city: parsed.city || null,
      postalCode: parsed.postalCode || null,
      country: parsed.country || null,
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
      discussionDeadline: reviewDeadline,
      reviewState: "pending",
      reviewExtensions: 0,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Consultant added",
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
  );

  await notifyCaseEvent(caseId, "consultant_added", {
    title: parsed.fullName,
    body: parsed.expertise ?? undefined,
    actor: user?.fullName || user?.email || authorized.role,
  });

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
  await touchCaseActivity(caseId);
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

export async function createLawyer(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const parsed = lawyerCreateSchema.parse(payload);
  const db = getDb();
  const spendResult = await spendForAction(user, {
    actionCode: "lawyer_create",
    caseId,
    idempotencyKey: `lawyer:${caseId}:${parsed.fullName}:${parsed.email}`,
    metadata: { fullName: parsed.fullName },
  });
  if (!spendResult.success) {
    throw new Error(spendResult.error);
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const reviewDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const firmUrl = parsed.firmUrl && parsed.firmUrl.length > 0 ? parsed.firmUrl : null;

  const inserted = await db
    .insert(lawyers)
    .values({
      caseId,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone || null,
      address: parsed.address || null,
      city: parsed.city || null,
      postalCode: parsed.postalCode || null,
      country: parsed.country || null,
      firmName: parsed.firmName || null,
      firmUrl,
      proofFileUrl: parsed.proof?.url ?? null,
      proofFilePathname: parsed.proof?.pathname ?? null,
      proofFileName: parsed.proof?.fileName ?? null,
      calledBy: authorized.role,
      notes: parsed.notes || null,
      status: "pending",
      invitationToken: token,
      invitationTokenExpiresAt: expiresAt,
      discussionDeadline: reviewDeadline,
      reviewState: "pending",
      reviewExtensions: 0,
    })
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Lawyer added",
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
  );

  await notifyCaseEvent(caseId, "lawyer_added", {
    title: parsed.fullName,
    body: parsed.firmName ?? undefined,
    actor: user?.fullName || user?.email || authorized.role,
  });

  // Send invitation email
  const calledByPartyName =
    authorized.role === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : authorized.case.respondentName || "the respondent";

  try {
    await sendLawyerInvitationEmail(parsed.email, {
      lawyerName: parsed.fullName,
      calledByPartyName,
      token,
      firmName: parsed.firmName ?? null,
    });
  } catch (err) {
    console.error("Failed to send lawyer invitation email:", err);
  }

  return inserted[0];
}

export async function deleteLawyer(user: AppUser, caseId: string, recordId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const db = getDb();
  await db.delete(lawyers).where(and(eq(lawyers.id, recordId), eq(lawyers.caseId, caseId)));
  await touchCaseActivity(caseId);
}

export async function resendLawyerInvitation(user: AppUser, caseId: string, lawyerId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(lawyers)
    .where(and(eq(lawyers.id, lawyerId), eq(lawyers.caseId, caseId)))
    .limit(1);
  const lawyer = rows[0];
  if (!lawyer) {
    throw new Error("Lawyer not found");
  }

  const token = nanoid(22);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db
    .update(lawyers)
    .set({ invitationToken: token, invitationTokenExpiresAt: expiresAt })
    .where(eq(lawyers.id, lawyerId));

  const calledByPartyName =
    lawyer.calledBy === "claimant"
      ? authorized.case.claimantName || "the claimant"
      : lawyer.calledBy === "respondent"
        ? authorized.case.respondentName || "the respondent"
        : "the arbitrator";

  await sendLawyerInvitationEmail(lawyer.email, {
    lawyerName: lawyer.fullName,
    calledByPartyName,
    token,
    firmName: lawyer.firmName ?? null,
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

  await recordCaseAuditEvent(
    caseId,
    "note",
    "Expertise request created",
    parsed.title,
    { user, impersonation: authorized.impersonation },
    {
      eventKey: "expertise_added",
      actorRole: authorized.role,
      entityType: "expertise",
      entityId: inserted[0].id,
      entityTitle: parsed.title,
    },
  );

  await notifyCaseEvent(caseId, "expertise_added", {
    title: parsed.title,
    body: parsed.description ?? undefined,
    actor: user?.fullName || user?.email || authorized.role,
  });

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
  await touchCaseActivity(caseId);
}

type CommentableKind = "evidence" | "witnesses" | "expertise";

export async function addRecordComment(
  user: AppUser,
  caseId: string,
  kind: CommentableKind,
  recordId: string,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }

  const parsed = recordCommentCreateSchema.parse(payload);
  const db = getDb();
  const submittedAt = new Date().toISOString();
  const submittedBy = authorized.role;
  const entry = {
    comment: parsed.comment,
    submittedBy,
    submittedAt,
    userId: user?.id ?? null,
    userName: user?.fullName || user?.email || "Unknown user",
  };

  if (kind === "evidence") {
    const rows = await db
      .select()
      .from(evidence)
      .where(and(eq(evidence.id, recordId), eq(evidence.caseId, caseId)))
      .limit(1);
    const record = rows[0];
    if (!record) throw new Error("Evidence not found");
    const discussion = Array.isArray(record.discussion) ? record.discussion : [];
    const updated = await db
      .update(evidence)
      .set({ discussion: [...discussion, entry], updatedAt: new Date() })
      .where(eq(evidence.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "message",
      "Evidence comment added",
      `${record.title}: ${parsed.comment.slice(0, 160)}`,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "evidence_comment_added",
        actorRole: submittedBy,
        entityType: "evidence",
        entityId: record.id,
        entityTitle: record.title,
      },
    );
    return updated[0];
  }

  if (kind === "witnesses") {
    const rows = await db
      .select()
      .from(witnesses)
      .where(and(eq(witnesses.id, recordId), eq(witnesses.caseId, caseId)))
      .limit(1);
    const record = rows[0];
    if (!record) throw new Error("Witness not found");
    const discussion = Array.isArray(record.discussion) ? record.discussion : [];
    const updated = await db
      .update(witnesses)
      .set({ discussion: [...discussion, entry], updatedAt: new Date() })
      .where(eq(witnesses.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "message",
      "Witness comment added",
      `${record.fullName}: ${parsed.comment.slice(0, 160)}`,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "witness_comment_added",
        actorRole: submittedBy,
        entityType: "witness",
        entityId: record.id,
        entityTitle: record.fullName,
      },
    );
    return updated[0];
  }

  const rows = await db
    .select()
    .from(expertiseRequests)
    .where(and(eq(expertiseRequests.id, recordId), eq(expertiseRequests.caseId, caseId)))
    .limit(1);
  const record = rows[0];
  if (!record) throw new Error("Expertise request not found");
  const discussion = Array.isArray(record.discussion) ? record.discussion : [];
  const updated = await db
    .update(expertiseRequests)
    .set({ discussion: [...discussion, entry], updatedAt: new Date() })
    .where(eq(expertiseRequests.id, recordId))
    .returning();
  await recordCaseAuditEvent(
    caseId,
    "message",
    "Expertise comment added",
    `${record.title}: ${parsed.comment.slice(0, 160)}`,
    { user, impersonation: authorized.impersonation },
    {
      eventKey: "expertise_comment_added",
      actorRole: submittedBy,
      entityType: "expertise",
      entityId: record.id,
      entityTitle: record.title,
    },
  );
  return updated[0];
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

// AI rewrites the user-supplied statement keeping only what is in scope
// for DIN.ORG arbitration. Returns a sanitized version + a list of the
// passages that were removed and why. Costs `statement_sanitize` tokens.
// Edit-only schema. Claude outputs ONLY the passages to remove — never
// the full sanitized text — so the response stays small even for a
// 50-page complaint. We then compute the sanitized text on our side by
// stripping each listed passage from the original. This dropped the
// sanitize call from ~500s to ~30s on a 19-page document.
const sanitizeOutputSchema = z.object({
  removed: z
    .array(
      z.object({
        passage: z
          .string()
          .default("")
          .describe(
            "Verbatim quote of the passage to remove from the original text. Must match the source bytes exactly so the system can find and remove it.",
          ),
        reason: z
          .string()
          .default("")
          .describe("Plain-language reason why this is out of arbitration scope."),
      }),
    )
    .default([])
    .describe("Each verbatim passage from the original that should be removed."),
  note: z
    .string()
    .default("")
    .describe("One short paragraph summary for the party — what was removed and why."),
});

const SANITIZE_SYSTEM_PROMPT = `You are a legal assistant for DIN.ORG, an international online arbitration tribunal that decides civil and commercial disputes between private parties.

YOUR JOB IS NARROW. By default you keep the entire statement intact, including the full factual narrative, dates, names, amounts, contractual references, and legal arguments. You only remove or rewrite the specific passages that an arbitral tribunal genuinely cannot grant — and you keep everything else untouched.

WHAT AN ARBITRAL TRIBUNAL CAN DO (KEEP THESE — even if they sound formal or court-flavoured):
- Order a party to pay money — damages, refund, restitution, agreed price, interest, costs. If the loser does not pay, the winner enforces via the ordinary debt-collection / Mahnklage / exequatur route. This is normal arbitration and stays in.
- Order a party to perform a contractual obligation, deliver, hand over goods, transfer rights, sign or execute documents, including notarial deeds (Notariatsakte). Keep these.
- Declare contractual rights and duties between the parties, declare a contract terminated, rescinded, or amended. Keep.
- Award damages, agreed penalties, contract penalties (Vertragsstrafen), set-offs. Keep.
- Confidentiality, non-compete and similar inter-party covenants enforceable as contractual obligations. Keep.
- The full factual statement of what happened, dates, places, evidence references, witness mentions, attachments. Keep verbatim.
- Legal arguments about contract law, tort, unjust enrichment, warranty, professional liability, IP licensing, partnership. Keep.
- References to court documents, prior court orders, settlement attempts. Keep — they are context.

WHAT AN ARBITRAL TRIBUNAL CANNOT DO (REMOVE OR REWRITE ONLY THESE):
- Preliminary / interim injunctions enforceable against third parties or by state coercion: einstweilige Verfügung, einstweilige Anordnung, Sicherungsverfügung, freezing order, restraining order against a non-party. (An arbitral tribunal can issue interim measures inter partes but not bind the state or third parties; flag these specifically.)
- Criminal sanctions: convictions, fines payable to the state, imprisonment, criminal records, Strafantrag/Strafanzeige asking the platform to prosecute, custodial orders. Remove.
- Orders that require a state register entry: changes to the land register, commercial register, civil status register, criminal register. Remove the request to make the entry, but keep the underlying contractual or monetary claim.
- Public-law and administrative orders against government bodies. Remove.
- Asylum, immigration, family-status decisions reserved to state courts. Remove.

OUTPUT RULES — IMPORTANT:
- DO NOT output the full sanitized text. The system applies your edits server-side; you only need to identify what to remove.
- "removed" = a list of verbatim passages from the original that should be stripped. EACH passage MUST be a byte-for-byte copy of the source — same words, same punctuation, same line breaks, same spelling. Do not paraphrase, do not translate, do not normalize whitespace. The system uses string matching to find and remove the passage, so an exact copy is required.
- Each passage entry also gets a one-sentence "reason" explaining why it is outside arbitral scope.
- Keep passages SHORT and SPECIFIC — preferably a single sentence or clause, at most a paragraph. If a whole paragraph is fine but one sentence inside it is out of scope, list ONLY that sentence.
- "note" = one short paragraph for the party. If you removed nothing, say "Nothing to remove — your statement is already in scope for arbitration." If you removed a small piece, say so explicitly.

If you find yourself listing more than ~10% of the text in "removed", stop and reconsider — almost certainly you are being too aggressive. Default = keep. List nothing if nothing needs to come out.
`;

async function fetchAttachmentBuffer(
  storedUrl: string,
): Promise<{ buffer: Buffer; mediaType: string }> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Blob token not configured");
  }
  const meta = await head(storedUrl, { token: env.BLOB_READ_WRITE_TOKEN });
  const upstream = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error("Could not download the attached document.");
  }
  const buffer = Buffer.from(await upstream.arrayBuffer());
  // Anthropic limits documents to ~32 MB. Be conservative.
  const MAX_BYTES = 25 * 1024 * 1024;
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(
      "Attached document is too large for the AI to read. Please paste the text into the field instead.",
    );
  }
  return {
    buffer,
    mediaType: meta.contentType || "application/octet-stream",
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse is a Node-side PDF text extractor. Runs in milliseconds
  // even on large legal documents — much faster and cheaper than asking
  // Claude to read the PDF and dump verbatim text. Imported dynamically
  // to keep cold-start lean on routes that never touch sanitize.
  // @ts-ignore — package may not be installed in dev, Vercel installs from package.json
  const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text || "";
}

// Apply Claude's edit instructions to the original text. Each listed
// passage is removed string-by-string. If a passage isn't found
// verbatim in the source we fall back to a normalized whitespace match
// before giving up — Claude usually quotes accurately but minor
// whitespace drift happens with PDF-extracted text.
function applySanitizeEdits(
  original: string,
  removed: Array<{ passage: string; reason: string }>,
) {
  let result = original;
  const applied: Array<{ passage: string; reason: string; matched: boolean }> = [];
  for (const entry of removed) {
    const passage = (entry.passage || "").trim();
    if (!passage) continue;
    let next = result.split(passage).join("");
    let matched = next !== result;
    if (!matched) {
      // Whitespace-tolerant fallback: try to find a region whose collapsed
      // whitespace matches the passage's collapsed whitespace.
      const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
      const target = collapse(passage);
      const collapsedSource = collapse(result);
      const idx = collapsedSource.indexOf(target);
      if (idx >= 0) {
        // Walk the original to find where these collapsed-source chars start/end.
        let collapsedPos = 0;
        let originalStart = -1;
        let originalEnd = -1;
        for (let i = 0; i < result.length; i++) {
          const ch = result[i];
          const isWs = /\s/.test(ch);
          if (isWs) {
            // collapsed source has at most one space per run of whitespace
            if (collapsedPos > 0 && collapsedSource[collapsedPos - 1] !== " ") {
              if (originalStart === idx) originalStart = i;
              collapsedPos++;
            }
          } else {
            if (collapsedPos === idx && originalStart < 0) originalStart = i;
            collapsedPos++;
            if (collapsedPos === idx + target.length) {
              originalEnd = i + 1;
              break;
            }
          }
        }
        if (originalStart >= 0 && originalEnd > originalStart) {
          next = result.slice(0, originalStart) + result.slice(originalEnd);
          matched = true;
        }
      }
    }
    if (matched) result = next;
    applied.push({ passage: entry.passage, reason: entry.reason, matched });
  }
  return { sanitized: result, applied };
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  // mammoth parses .docx (Open Office XML) and returns plain text.
  // It does NOT understand the older .doc binary format — those are
  // rejected upstream with a clearer error. The dynamic import keeps
  // mammoth out of the cold-start path for endpoints that don't need it.
  // @ts-ignore — package may not be installed in dev, Vercel installs from package.json
  const mammoth = (await import("mammoth")) as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value?: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  return result.value || "";
}

export async function sanitizeStatementForArbitration(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the claimant or respondent can run the sanitize step");
  }

  const isClaimant = authorized.role === "claimant";
  const text = (
    isClaimant ? authorized.case.claimantStatement : authorized.case.respondentStatement
  ) ?? "";
  const fileUrl = isClaimant
    ? authorized.case.claimantStatementFileUrl
    : authorized.case.respondentStatementFileUrl;
  const fileName = isClaimant
    ? authorized.case.claimantStatementFileName
    : authorized.case.respondentStatementFileName;

  // Source preference:
  //   1. Saved text in the field (cheapest, most direct)
  //   2. Attached document — Claude reads PDFs natively. For non-PDF
  //      file types we don't have a reliable extraction path, so error
  //      with a clear "paste the text" message.
  const hasText = !!text.trim();
  const hasFile = !!fileUrl;
  if (!hasText && !hasFile) {
    throw new Error(
      "Add either text or a document to your statement first, then run the AI clean-up.",
    );
  }

  const spend = await spendForAction(user, {
    actionCode: "statement_sanitize",
    caseId,
    idempotencyKey: `statement_sanitize:${caseId}:${authorized.role}:${Date.now()}`,
    metadata: { side: authorized.role, length: text.length, hasFile },
  });
  if (!spend.success) {
    throw new Error(spend.error || "Insufficient tokens");
  }

  const language = (authorized.case.language || "en").toLowerCase();
  const taskInstruction = [
    `The statement was filed by the ${authorized.role}.`,
    `Case language: ${language}. Write the sanitized text, removed-passages list, and note in this language.`,
    "Output JSON conforming to the schema.",
  ].join(" ");

  // Resolve the source text. Three cases:
  //   - Saved text in the field → use directly
  //   - PDF attached → extract with pdf-parse (Node-side, ms)
  //   - DOCX attached → extract with mammoth (Node-side, ms)
  // Any AI-driven extraction was removed — for a 19-page legal complaint
  // it consistently exceeded the function timeout. With server-side
  // extraction we only spend AI time on the actual sanitize call.
  let sourceText = text.trim();
  let sourceLabel = "saved text";
  if (!sourceText && fileUrl) {
    const downloaded = await fetchAttachmentBuffer(fileUrl);
    const lowerName = (fileName ?? "").toLowerCase();
    const isPdf =
      downloaded.mediaType === "application/pdf" || lowerName.endsWith(".pdf");
    const isDocx =
      downloaded.mediaType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      lowerName.endsWith(".docx");
    const isLegacyDoc = lowerName.endsWith(".doc") && !isDocx;
    if (isLegacyDoc) {
      throw new Error(
        "Legacy .doc files cannot be parsed automatically. Please save the document as PDF or .docx and re-upload, or paste the text into the field.",
      );
    }
    if (isPdf) {
      sourceText = (await extractPdfText(downloaded.buffer)).trim();
      sourceLabel = `PDF (${fileName ?? "attachment"})`;
    } else if (isDocx) {
      sourceText = (await extractDocxText(downloaded.buffer)).trim();
      sourceLabel = `Word document (${fileName ?? "attachment"})`;
    } else {
      throw new Error(
        "Only PDF and .docx files can be read directly. For other formats please paste the text from the document into the field, save it, and try again.",
      );
    }
    if (!sourceText) {
      throw new Error(
        "Could not extract any text from the attached document. Please paste the text into the field instead.",
      );
    }
  }

  // Single AI call: ask for ONLY the passages to remove (small output).
  // Server then computes the sanitized text by stripping each passage
  // from the source. This keeps the response well below the 4K output
  // cap even for a 50-page complaint.
  const SANITIZE_MAX_TOKENS = 8000;
  const prompt = [
    SANITIZE_SYSTEM_PROMPT,
    "",
    taskInstruction,
    "",
    `Source: ${sourceLabel}.`,
    "",
    "STATEMENT:",
    sourceText,
  ].join("\n");
  const aiResult = await generateStructuredObject(prompt, sanitizeOutputSchema, {
    maxTokens: SANITIZE_MAX_TOKENS,
  });

  const removedEntries: Array<{ passage: string; reason: string }> = aiResult.removed ?? [];
  const { sanitized, applied } = applySanitizeEdits(sourceText, removedEntries);
  const matchedCount = applied.filter((entry) => entry.matched).length;
  const unmatchedCount = applied.length - matchedCount;
  const result = {
    sanitized,
    removed: removedEntries.map((entry, idx) => ({
      passage: entry.passage,
      reason: entry.reason,
      matched: applied[idx]?.matched ?? false,
    })),
    note: aiResult.note,
  };

  await createCaseActivity(
    caseId,
    "note",
    "AI sanitize ran on statement",
    `${authorized.role} statement (${sourceLabel}), ${matchedCount} passage(s) removed${
      unmatchedCount > 0 ? `, ${unmatchedCount} could not be matched verbatim` : ""
    }.`,
    { user, impersonation: authorized.impersonation },
  );

  return result;
}

// Either active party (claimant or respondent) can change the case
// language. Free of charge — it's a setting, not an AI action.
export async function updateCaseLanguage(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the claimant or respondent can change the case language");
  }
  const parsed = caseLanguageUpdateSchema.parse(payload);
  const language = parsed.language.trim().toLowerCase();
  const db = getDb();
  const updated = await db
    .update(cases)
    .set({ language })
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    "Case language changed",
    `Language set to ${language}.`,
    { user, impersonation: authorized.impersonation },
  );

  return updated[0];
}

// Single side updates their free-form statement. The side is inferred
// from the case role so a claimant can never overwrite the respondent's
// text and vice versa. Replaces updateCaseClaims for the new UI.
export async function updateCaseStatement(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the claimant or respondent can edit a statement");
  }

  const parsed = caseStatementUpdateSchema.parse(payload);
  const cleanedText = parsed.statement.trim() || null;
  const isClaimant = authorized.role === "claimant";

  // Resolve attachment field: explicit replacement, explicit removal, or
  // leave as-is. The user can save text changes without touching the file
  // by passing only `statement`.
  const currentFileUrl = isClaimant
    ? authorized.case.claimantStatementFileUrl
    : authorized.case.respondentStatementFileUrl;
  const currentFilePath = isClaimant
    ? authorized.case.claimantStatementFilePathname
    : authorized.case.respondentStatementFilePathname;
  const currentFileName = isClaimant
    ? authorized.case.claimantStatementFileName
    : authorized.case.respondentStatementFileName;

  let nextFileUrl: string | null = currentFileUrl ?? null;
  let nextFilePath: string | null = currentFilePath ?? null;
  let nextFileName: string | null = currentFileName ?? null;
  if (parsed.removeAttachment) {
    nextFileUrl = null;
    nextFilePath = null;
    nextFileName = null;
  } else if (parsed.attachment) {
    nextFileUrl = parsed.attachment.url;
    nextFilePath = parsed.attachment.pathname;
    nextFileName = parsed.attachment.fileName;
  }

  const db = getDb();
  const update = isClaimant
    ? {
        claimantStatement: cleanedText,
        claimantStatementFileUrl: nextFileUrl,
        claimantStatementFilePathname: nextFilePath,
        claimantStatementFileName: nextFileName,
      }
    : {
        respondentStatement: cleanedText,
        respondentStatementFileUrl: nextFileUrl,
        respondentStatementFilePathname: nextFilePath,
        respondentStatementFileName: nextFileName,
      };

  const updated = await db
    .update(cases)
    .set(update)
    .where(eq(cases.id, caseId))
    .returning();

  const summary =
    cleanedText && nextFileUrl
      ? "Statement and document saved."
      : cleanedText
        ? "Statement saved."
        : nextFileUrl
          ? "Document saved."
          : "Statement cleared.";

  await createCaseActivity(
    caseId,
    "note",
    isClaimant ? "Claimant statement updated" : "Respondent statement updated",
    summary,
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
  if (!authorized || (authorized.role !== "claimant" && authorized.role !== "respondent")) {
    throw new Error("Forbidden");
  }

  const parsed = caseContactsUpdateSchema.parse(payload);
  const db = getDb();
  const respondentLinked = Boolean(authorized.case.respondentLinkedAt || authorized.case.respondentUserId);
  const role = authorized.role;

  const update: Partial<typeof cases.$inferInsert> = {};
  const claimantTouched =
    parsed.claimantName !== undefined ||
    parsed.claimantEmail !== undefined ||
    parsed.claimantPhone !== undefined ||
    parsed.claimantAddress !== undefined ||
    parsed.claimantCity !== undefined ||
    parsed.claimantPostalCode !== undefined ||
    parsed.claimantCountry !== undefined;
  const respondentTouched =
    parsed.respondentName !== undefined ||
    parsed.respondentEmail !== undefined ||
    parsed.respondentPhone !== undefined ||
    parsed.respondentAddress !== undefined ||
    parsed.respondentCity !== undefined ||
    parsed.respondentPostalCode !== undefined ||
    parsed.respondentCountry !== undefined;

  if (claimantTouched) {
    if (role !== "claimant") {
      throw new Error("Only the claimant can edit their contact details.");
    }
    if (parsed.claimantName !== undefined) update.claimantName = parsed.claimantName;
    if (parsed.claimantEmail !== undefined) update.claimantEmail = parsed.claimantEmail;
    if (parsed.claimantPhone !== undefined) update.claimantPhone = parsed.claimantPhone || null;
    if (parsed.claimantAddress !== undefined) update.claimantAddress = parsed.claimantAddress || null;
    if (parsed.claimantCity !== undefined) update.claimantCity = parsed.claimantCity || null;
    if (parsed.claimantPostalCode !== undefined) update.claimantPostalCode = parsed.claimantPostalCode || null;
    if (parsed.claimantCountry !== undefined) update.claimantCountry = parsed.claimantCountry || null;
  }

  if (respondentTouched) {
    if (role === "claimant") {
      if (respondentLinked) {
        throw new Error("Respondent has joined the case and now manages their own details.");
      }
    } else if (role !== "respondent") {
      throw new Error("Only the respondent can edit their contact details.");
    }
    if (parsed.respondentName !== undefined) update.respondentName = parsed.respondentName;
    if (parsed.respondentEmail !== undefined) update.respondentEmail = parsed.respondentEmail;
    if (parsed.respondentPhone !== undefined) update.respondentPhone = parsed.respondentPhone || null;
    if (parsed.respondentAddress !== undefined) update.respondentAddress = parsed.respondentAddress || null;
    if (parsed.respondentCity !== undefined) update.respondentCity = parsed.respondentCity || null;
    if (parsed.respondentPostalCode !== undefined) update.respondentPostalCode = parsed.respondentPostalCode || null;
    if (parsed.respondentCountry !== undefined) update.respondentCountry = parsed.respondentCountry || null;
  }

  if (Object.keys(update).length === 0) {
    return authorized.case;
  }

  const nextClaimantName = (update.claimantName as string | undefined) ?? authorized.case.claimantName;
  const nextRespondentName = (update.respondentName as string | undefined) ?? authorized.case.respondentName;
  if (nextClaimantName && nextRespondentName) {
    update.title = buildCaseTitle(nextClaimantName, nextRespondentName);
  }

  const updated = await db
    .update(cases)
    .set(update)
    .where(eq(cases.id, caseId))
    .returning();

  await createCaseActivity(
    caseId,
    "status_change",
    "Contacts updated",
    `${role === "claimant" ? "Claimant" : "Respondent"} updated contact information.`,
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
    await recordCaseAuditEvent(
      caseId,
      "note",
      "Evidence accepted",
      record.title,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "evidence_accepted",
        actorRole: reviewerRole,
        entityType: "evidence",
        entityId: record.id,
        entityTitle: record.title,
        outcome: "accepted",
      },
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
    await recordCaseAuditEvent(
      caseId,
      "note",
      "Evidence dismissed",
      `${record.title}: ${parsed.reason}`,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "evidence_dismissed",
        actorRole: reviewerRole,
        entityType: "evidence",
        entityId: record.id,
        entityTitle: record.title,
        outcome: "dismissed",
        reason: parsed.reason,
      },
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
    await recordCaseAuditEvent(
      caseId,
      "note",
      "AI expertise requested",
      record.title,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "expertise_added",
        actorRole: reviewerRole,
        entityType: "expertise",
        entityId: expertise[0].id,
        entityTitle: expertise[0].title,
        sourceEntityType: "evidence",
        sourceEntityId: record.id,
      },
    );
    return updated[0];
  }

  throw new Error("Unsupported action");
}

export async function runExpertiseWorkflow(
  user: AppUser,
  caseId: string,
  recordId: string,
  action: "generate" | "accept" | "regenerate" | "finalize" | "reject",
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(expertiseRequests)
    .where(and(eq(expertiseRequests.id, recordId), eq(expertiseRequests.caseId, caseId)))
    .limit(1);
  const record = rows[0];
  if (!record) {
    throw new Error("Expertise request not found");
  }

  const role = authorized.role;
  const now = new Date();

  if (action === "generate" || action === "regenerate") {
    if (role !== "claimant" && role !== "respondent") {
      throw new Error("Only the requesting party can generate or regenerate expertise");
    }
    const { generateStructuredObject, isAiConfigured } = await import("@/server/ai/service");
    if (!isAiConfigured()) {
      throw new Error("AI is not configured.");
    }
    const expertiseSchema = (await import("zod")).z.object({
      analysis: (await import("zod")).z.string().min(20),
      key_points: (await import("zod")).z.array((await import("zod")).z.string()).min(2).max(8),
    });
    const prompt = [
      "You are an expert reviewer producing an objective written expertise on the requested topic.",
      `Title: ${record.title}`,
      `Description: ${record.description ?? "(none)"}`,
      "Output JSON: { analysis: string (one or two paragraphs), key_points: string[] (2-8 items) }.",
    ].join("\n");
    const aiResult = (await generateStructuredObject(prompt, expertiseSchema)) as {
      analysis: string;
      key_points: string[];
    };
    const aiText = `${aiResult.analysis}\n\nKey points:\n${aiResult.key_points
      .map((point) => `- ${point}`)
      .join("\n")}`;
    const updated = await db
      .update(expertiseRequests)
      .set({ aiAnalysis: aiText, status: "ready", updatedAt: now })
      .where(eq(expertiseRequests.id, recordId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      action === "regenerate" ? "Expertise regenerated" : "Expertise generated",
      record.title,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  if (action === "accept") {
    if (role !== "claimant" && role !== "respondent") {
      throw new Error("Only the requesting party can accept the AI expertise");
    }
    if (record.status !== "ready") {
      throw new Error("Generate the expertise first");
    }
    const updated = await db
      .update(expertiseRequests)
      .set({ status: "accepted", updatedAt: now })
      .where(eq(expertiseRequests.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      "Expertise accepted (awaiting DIN.ORG review)",
      record.title,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "expertise_accepted",
        actorRole: role,
        entityType: "expertise",
        entityId: record.id,
        entityTitle: record.title,
        outcome: "accepted",
      },
    );
    return updated[0];
  }

  if (action === "reject") {
    if (role !== "claimant" && role !== "respondent" && role !== "moderator") {
      throw new Error("Only a case party or DIN.ORG moderator can reject expertise");
    }
    if (!["ready", "accepted"].includes(record.status)) {
      throw new Error("Only generated or accepted expertise can be rejected");
    }
    const updated = await db
      .update(expertiseRequests)
      .set({ status: "rejected", updatedAt: now })
      .where(eq(expertiseRequests.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      "Expertise rejected",
      record.title,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "expertise_rejected",
        actorRole: role,
        entityType: "expertise",
        entityId: record.id,
        entityTitle: record.title,
        outcome: "rejected",
      },
    );
    return updated[0];
  }

  if (action === "finalize") {
    if (role !== "moderator") {
      throw new Error("Only DIN.ORG moderators can finalize an expertise");
    }
    if (record.status !== "accepted") {
      throw new Error("Expertise must first be accepted by the requesting party");
    }
    const updated = await db
      .update(expertiseRequests)
      .set({ status: "published", isPublished: true, updatedAt: now })
      .where(eq(expertiseRequests.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      "Expertise finalized by DIN.ORG",
      record.title,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "expertise_finalized",
        actorRole: role,
        entityType: "expertise",
        entityId: record.id,
        entityTitle: record.title,
        outcome: "published",
      },
    );
    return updated[0];
  }

  throw new Error("Unsupported expertise action");
}

type ReviewableKind = "witnesses" | "consultants" | "lawyers";

export async function reviewParticipant(
  user: AppUser,
  caseId: string,
  kind: ReviewableKind,
  recordId: string,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const reviewerRole = authorized.role;
  if (reviewerRole !== "claimant" && reviewerRole !== "respondent") {
    throw new Error("Only the opposing party can review records");
  }

  const parsed = evidenceReviewActionSchema.parse(payload);
  const db = getDb();

  const tableMap = { witnesses, consultants, lawyers } as const;
  const table = tableMap[kind];

  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.id, recordId), eq(table.caseId, caseId)))
    .limit(1);
  const record = rows[0] as
    | (typeof witnesses.$inferSelect & { fullName: string; calledBy: string })
    | (typeof consultants.$inferSelect & { fullName: string; calledBy: string })
    | (typeof lawyers.$inferSelect & { fullName: string; calledBy: string })
    | undefined;
  const singularLabel =
    kind === "witnesses" ? "witness" : kind === "consultants" ? "consultant" : "lawyer";
  if (!record) {
    throw new Error(`${singularLabel.charAt(0).toUpperCase()}${singularLabel.slice(1)} not found`);
  }
  if (!isOpposingRole(reviewerRole, record.calledBy)) {
    throw new Error(`Only the opposing party can review this ${singularLabel}`);
  }

  const now = new Date();
  const expired = record.discussionDeadline ? now > record.discussionDeadline : false;
  const currentState = record.reviewState || "pending";
  const isOpen = currentState === "pending" && !expired;
  const label = singularLabel.charAt(0).toUpperCase() + singularLabel.slice(1);

  if (parsed.action === "accept") {
    if (!isOpen) throw new Error("Review window is closed");
    const updated = await db
      .update(table)
      .set({
        reviewState: "accepted",
        status: "accepted",
        updatedAt: now,
      })
      .where(eq(table.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      `${label} accepted`,
      record.fullName,
      { user, impersonation: authorized.impersonation },
      {
        eventKey:
          kind === "witnesses"
            ? "witness_accepted"
            : kind === "consultants"
              ? "consultant_accepted"
              : "lawyer_accepted",
        actorRole: reviewerRole,
        entityType: singularLabel,
        entityId: record.id,
        entityTitle: record.fullName,
        outcome: "accepted",
      },
    );
    return updated[0];
  }

  if (parsed.action === "dismiss") {
    if (!isOpen) throw new Error("Review window is closed");
    const updated = await db
      .update(table)
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
      .where(eq(table.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      `${label} dismissed`,
      `${record.fullName}: ${parsed.reason}`,
      { user, impersonation: authorized.impersonation },
      {
        eventKey:
          kind === "witnesses"
            ? "witness_dismissed"
            : kind === "consultants"
              ? "consultant_dismissed"
              : "lawyer_dismissed",
        actorRole: reviewerRole,
        entityType: singularLabel,
        entityId: record.id,
        entityTitle: record.fullName,
        outcome: "dismissed",
        reason: parsed.reason,
      },
    );
    return updated[0];
  }

  if (parsed.action === "extend") {
    if (currentState !== "pending") throw new Error("Review window is closed");
    const used = record.reviewExtensions ?? 0;
    if (used >= EVIDENCE_REVIEW_MAX_EXTENSIONS) {
      throw new Error("No more extensions available; record will be presented as is.");
    }
    const next = used + 1;
    const actionCode = (`evidence_review_extend_${next}` as
      | "evidence_review_extend_1"
      | "evidence_review_extend_2"
      | "evidence_review_extend_3");
    const spend = await spendForAction(user, {
      actionCode,
      caseId,
      idempotencyKey: `${kind}_review_extend:${recordId}:${next}`,
      metadata: { recordId, kind, extension: next },
    });
    if (!spend.success) {
      throw new Error(spend.error || "Insufficient tokens");
    }
    const baseDeadline =
      record.discussionDeadline && record.discussionDeadline > now
        ? record.discussionDeadline
        : now;
    const newDeadline = new Date(
      baseDeadline.getTime() + EVIDENCE_REVIEW_EXTENSION_DAYS * 24 * 60 * 60 * 1000,
    );
    const updated = await db
      .update(table)
      .set({
        reviewExtensions: next,
        discussionDeadline: newDeadline,
        updatedAt: now,
      })
      .where(eq(table.id, recordId))
      .returning();
    await createCaseActivity(
      caseId,
      "note",
      `${label} review extended (#${next})`,
      `${record.fullName}: cost ${EVIDENCE_REVIEW_EXTENSION_COSTS[next - 1]} tokens`,
      { user, impersonation: authorized.impersonation },
    );
    return updated[0];
  }

  if (parsed.action === "request_expertise") {
    if (!isOpen) throw new Error("Review window is closed");
    const spend = await spendForAction(user, {
      actionCode: "expertise_create",
      caseId,
      idempotencyKey: `${kind}_expertise:${recordId}`,
      metadata: { recordId, kind },
    });
    if (!spend.success) {
      throw new Error(spend.error || "Insufficient tokens");
    }
    const expertise = await db
      .insert(expertiseRequests)
      .values({
        caseId,
        requestedBy: reviewerRole,
        title: parsed.title || `AI expertise on ${singularLabel}: ${record.fullName}`,
        description:
          parsed.description ||
          `Requested by ${reviewerRole} during ${label.toLowerCase()} review window. Record id: ${recordId}.`,
        fileReferences: null,
        status: "draft",
      })
      .returning();
    const updated = await db
      .update(table)
      .set({
        reviewState: "expertise_requested",
        status: "under_review",
        reviewExpertiseRequestId: expertise[0].id,
        updatedAt: now,
      })
      .where(eq(table.id, recordId))
      .returning();
    await recordCaseAuditEvent(
      caseId,
      "note",
      "AI expertise requested",
      record.fullName,
      { user, impersonation: authorized.impersonation },
      {
        eventKey: "expertise_added",
        actorRole: reviewerRole,
        entityType: "expertise",
        entityId: expertise[0].id,
        entityTitle: expertise[0].title,
        sourceEntityType: singularLabel,
        sourceEntityId: record.id,
      },
    );
    return updated[0];
  }

  throw new Error("Unsupported action");
}

// ============================================================================
// Multi-party support
// ============================================================================

const PARTY_APPROVAL_DEADLINE_DAYS = 7;
const PARTY_INVITATION_TOKEN_DAYS = 7;

async function loadInvitingParty(
  caseId: string,
  user: AppUser,
): Promise<typeof caseParties.$inferSelect | null> {
  const email = (user?.email || "").trim().toLowerCase();
  if (!email) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(
      and(
        eq(caseParties.caseId, caseId),
        eq(caseParties.status, "active"),
        sql`lower(${caseParties.email}) = ${email}`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function activeCaseParties(caseId: string) {
  const db = getDb();
  return db
    .select()
    .from(caseParties)
    .where(and(eq(caseParties.caseId, caseId), eq(caseParties.status, "active")));
}

export async function inviteAdditionalParty(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Only an active party on the case can invite additional parties");
  }

  const parsed = partyInviteSchema.parse(payload);
  const db = getDb();

  // Find the inviting party row. If not present (case was created before
  // multi-party migration backfill ran), fall through using email match on
  // the original cases.* fields.
  const invitingPartyRow = await loadInvitingParty(caseId, user);
  const allActive = await activeCaseParties(caseId);

  // Reject duplicate invites for the same email + side.
  const normalizedEmail = parsed.email.trim().toLowerCase();
  const dupRows = await db
    .select({ id: caseParties.id })
    .from(caseParties)
    .where(
      and(
        eq(caseParties.caseId, caseId),
        eq(caseParties.side, parsed.side),
        sql`lower(${caseParties.email}) = ${normalizedEmail}`,
      ),
    )
    .limit(1);
  if (dupRows.length > 0) {
    throw new Error("This person is already a party on this side");
  }

  const token = nanoid(22);
  const tokenExpires = new Date(Date.now() + PARTY_INVITATION_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  const approvalDeadline = new Date(Date.now() + PARTY_APPROVAL_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

  // Inviter auto-approves their own proposal.
  const initialVotes: Record<string, "approve" | "reject"> = {};
  if (invitingPartyRow) {
    initialVotes[invitingPartyRow.id] = "approve";
  }

  const inserted = await db
    .insert(caseParties)
    .values({
      caseId,
      side: parsed.side,
      fullName: parsed.fullName,
      email: parsed.email,
      phone: parsed.phone || null,
      address: parsed.address || null,
      city: parsed.city || null,
      postalCode: parsed.postalCode || null,
      country: parsed.country || null,
      notes: parsed.notes || null,
      isOriginal: false,
      status: "pending_approval",
      invitationToken: token,
      invitationTokenExpiresAt: tokenExpires,
      invitedByPartyId: invitingPartyRow?.id ?? null,
      approvalDeadline,
      approvalVotesJson: initialVotes,
    })
    .returning();
  const newParty = inserted[0];

  await createCaseActivity(
    caseId,
    "note",
    `Additional ${parsed.side} proposed`,
    parsed.fullName,
    { user, impersonation: authorized.impersonation },
  );

  // Notify all OTHER active parties so they can vote.
  const inviterName = invitingPartyRow?.fullName || user?.fullName || user?.email || authorized.role;
  const caseRow = authorized.case;
  const recipients = allActive.filter(
    (p) => (invitingPartyRow ? p.id !== invitingPartyRow.id : true),
  );
  for (const voter of recipients) {
    try {
      await sendPartyApprovalRequestEmail(voter.email, {
        voterName: voter.fullName,
        proposedPartyName: parsed.fullName,
        proposedSide: parsed.side,
        invitedByPartyName: inviterName,
        caseNumber: caseRow.caseNumber,
        caseTitle: caseRow.title,
        deadline: approvalDeadline,
      });
    } catch (err) {
      console.error("Failed to send party approval request email:", err);
    }
  }

  // If this is a single-party case (only the inviter is active), the proposal
  // is approved immediately; advance straight to the invitation step.
  await maybeFinalizePartyApproval(caseId, newParty.id);

  return newParty;
}

async function maybeFinalizePartyApproval(caseId: string, partyId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(eq(caseParties.id, partyId))
    .limit(1);
  const party = rows[0];
  if (!party || party.status !== "pending_approval") return;

  const allActive = await activeCaseParties(caseId);
  const votes = (party.approvalVotesJson || {}) as Record<string, "approve" | "reject">;
  const now = new Date();
  const deadlinePassed = party.approvalDeadline ? now > party.approvalDeadline : false;

  // Reject takes priority — any single rejection kills the proposal.
  const anyReject = Object.values(votes).some((v) => v === "reject");
  if (anyReject) {
    await db
      .update(caseParties)
      .set({ status: "declined", declinedAt: now, updatedAt: now })
      .where(eq(caseParties.id, partyId));
    await createCaseActivity(
      caseId,
      "note",
      `Additional ${party.side} declined`,
      `${party.fullName} was rejected by an existing party.`,
      SYSTEM_ACTOR,
    );
    return;
  }

  // All active parties approved -> advance.
  const allApproved = allActive.every((p) => votes[p.id] === "approve");
  if (allApproved || deadlinePassed) {
    await db
      .update(caseParties)
      .set({ status: "pending_acceptance", updatedAt: now })
      .where(eq(caseParties.id, partyId));

    // Send the actual invitation email to the new party.
    const caseRow = (
      await db.select().from(cases).where(eq(cases.id, caseId)).limit(1)
    )[0];
    const inviter = party.invitedByPartyId
      ? (await db
          .select()
          .from(caseParties)
          .where(eq(caseParties.id, party.invitedByPartyId))
          .limit(1))[0]
      : null;
    if (caseRow && party.invitationToken) {
      try {
        await sendPartyInvitationEmail(party.email, {
          partyName: party.fullName,
          side: party.side,
          invitedByPartyName: inviter?.fullName || "an existing party",
          caseNumber: caseRow.caseNumber,
          caseTitle: caseRow.title,
          token: party.invitationToken,
        });
      } catch (err) {
        console.error("Failed to send party invitation email:", err);
      }
    }
    await createCaseActivity(
      caseId,
      "note",
      `Additional ${party.side} approved — invitation sent`,
      party.fullName,
      SYSTEM_ACTOR,
    );

    await notifyCaseEvent(caseId, "party_added", {
      title: party.fullName,
      body: `Added as additional ${party.side}.`,
    });
  }
}

export async function voteOnPartyAddition(
  user: AppUser,
  caseId: string,
  partyId: string,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Only an active party on the case can vote on additional parties");
  }

  const parsed = partyVoteSchema.parse(payload);
  const voter = await loadInvitingParty(caseId, user);
  if (!voter) {
    throw new Error("You are not an active party on this case");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(and(eq(caseParties.id, partyId), eq(caseParties.caseId, caseId)))
    .limit(1);
  const proposed = rows[0];
  if (!proposed) {
    throw new Error("Party not found");
  }
  if (proposed.status !== "pending_approval") {
    throw new Error("This proposal is no longer open for voting");
  }

  const votes = { ...(proposed.approvalVotesJson || {}) } as Record<string, "approve" | "reject">;
  votes[voter.id] = parsed.vote;
  const now = new Date();

  await db
    .update(caseParties)
    .set({ approvalVotesJson: votes, updatedAt: now })
    .where(eq(caseParties.id, partyId));

  await maybeFinalizePartyApproval(caseId, partyId);
  return { success: true };
}

export async function autoFinalizeOpenPartyProposals(caseId: string) {
  const db = getDb();
  const open = await db
    .select({ id: caseParties.id })
    .from(caseParties)
    .where(
      and(
        eq(caseParties.caseId, caseId),
        eq(caseParties.status, "pending_approval"),
        sql`${caseParties.approvalDeadline} IS NOT NULL AND ${caseParties.approvalDeadline} < NOW()`,
      ),
    );
  for (const row of open) {
    await maybeFinalizePartyApproval(caseId, row.id);
  }
}

export async function acceptPartyInvitation(token: string, user: AppUser) {
  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(
      and(
        eq(caseParties.invitationToken, token),
        eq(caseParties.status, "pending_acceptance"),
      ),
    )
    .limit(1);
  const party = rows[0];
  if (!party) {
    throw new Error("Invitation not found or already used");
  }
  if (party.invitationTokenExpiresAt && new Date() > party.invitationTokenExpiresAt) {
    throw new Error("Invitation link expired");
  }

  const now = new Date();
  await db
    .update(caseParties)
    .set({
      status: "active",
      joinedAt: now,
      userId: user?.id ?? null,
      updatedAt: now,
      invitationToken: null,
    })
    .where(eq(caseParties.id, party.id));

  await createCaseActivity(
    party.caseId,
    "note",
    `${party.fullName} joined as additional ${party.side}`,
    party.email,
    user ? { user, impersonation: null } : SYSTEM_ACTOR,
  );

  return { success: true };
}

export async function extendPartyApprovalDeadline(
  user: AppUser,
  caseId: string,
  partyId: string,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized || authorized.role === "moderator") {
    throw new Error("Only an active party on the case can extend approval deadlines");
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(and(eq(caseParties.id, partyId), eq(caseParties.caseId, caseId)))
    .limit(1);
  const party = rows[0];
  if (!party) {
    throw new Error("Party not found");
  }
  if (party.status !== "pending_approval") {
    throw new Error("This proposal is no longer open for extensions");
  }

  const used = party.approvalExtensions ?? 0;
  if (used >= PARTY_APPROVAL_MAX_EXTENSIONS) {
    throw new Error("No more extensions available; the proposal will be auto-approved at the deadline.");
  }
  const next = used + 1;
  const actionCode = (`party_approval_extend_${next}` as
    | "party_approval_extend_1"
    | "party_approval_extend_2"
    | "party_approval_extend_3");
  const spend = await spendForAction(user, {
    actionCode,
    caseId,
    idempotencyKey: `party_approval_extend:${partyId}:${next}`,
    metadata: { partyId, extension: next },
  });
  if (!spend.success) {
    throw new Error(spend.error || "Insufficient tokens");
  }

  const now = new Date();
  const baseDeadline =
    party.approvalDeadline && party.approvalDeadline > now ? party.approvalDeadline : now;
  const newDeadline = new Date(
    baseDeadline.getTime() + PARTY_APPROVAL_EXTENSION_DAYS * 24 * 60 * 60 * 1000,
  );

  const updated = await db
    .update(caseParties)
    .set({
      approvalExtensions: next,
      approvalDeadline: newDeadline,
      updatedAt: now,
    })
    .where(eq(caseParties.id, partyId))
    .returning();

  await createCaseActivity(
    caseId,
    "note",
    `Party approval extended (#${next})`,
    `${party.fullName}: cost ${PARTY_APPROVAL_EXTENSION_COSTS[next - 1]} tokens`,
    { user, impersonation: authorized.impersonation },
  );

  return updated[0];
}

export async function declinePartyInvitation(token: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(caseParties)
    .where(eq(caseParties.invitationToken, token))
    .limit(1);
  const party = rows[0];
  if (!party) {
    throw new Error("Invitation not found");
  }
  const now = new Date();
  await db
    .update(caseParties)
    .set({ status: "declined", declinedAt: now, updatedAt: now, invitationToken: null })
    .where(eq(caseParties.id, party.id));

  await createCaseActivity(
    party.caseId,
    "note",
    `${party.fullName} declined to join`,
    party.email,
    SYSTEM_ACTOR,
  );

  return { success: true };
}

// ============================================================================
// Translation (DeepL)
// ============================================================================

// Phase 1 — translate one side's statement TEXT to the case language.
// The viewer asks for it; charges 5 tokens; returns the translation but
// does NOT persist it (each invocation is a fresh translation, keep the
// data model simple). Either party can translate either side's text.
export async function translateStatementText(
  user: AppUser,
  caseId: string,
  side: "claimant" | "respondent",
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the claimant or respondent can translate statements");
  }
  const text = (
    side === "claimant" ? authorized.case.claimantStatement : authorized.case.respondentStatement
  ) ?? "";
  if (!text.trim()) {
    throw new Error("There is no text to translate on this side yet.");
  }

  const targetLang = (authorized.case.language || "en").toLowerCase();

  const spend = await spendForAction(user, {
    actionCode: "statement_translate",
    caseId,
    idempotencyKey: `statement_translate:${caseId}:${side}:${Date.now()}`,
    metadata: { side, targetLang, length: text.length },
  });
  if (!spend.success) {
    throw new Error(spend.error || "Insufficient tokens");
  }

  const result = await translateText(text, targetLang);

  await createCaseActivity(
    caseId,
    "note",
    "Statement translated",
    `${side} statement translated ${result.detectedSourceLang || "?"} → ${targetLang}.`,
    { user, impersonation: authorized.impersonation },
  );

  return {
    translatedText: result.translatedText,
    detectedSourceLang: result.detectedSourceLang,
    targetLang,
  };
}

// Phase 2 — translate the attached statement DOCUMENT (PDF/DOCX) to the
// case language via DeepL's document API. Stores the translated file
// alongside the original on the cases row. Re-running overwrites the
// previous translation. Charges 50 tokens.
export async function translateStatementDocument(
  user: AppUser,
  caseId: string,
  side: "claimant" | "respondent",
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the claimant or respondent can translate documents");
  }

  const isClaimant = side === "claimant";
  const sourceUrl = isClaimant
    ? authorized.case.claimantStatementFileUrl
    : authorized.case.respondentStatementFileUrl;
  const sourceName = isClaimant
    ? authorized.case.claimantStatementFileName
    : authorized.case.respondentStatementFileName;
  if (!sourceUrl) {
    throw new Error("There is no document attached on this side to translate.");
  }

  const targetLang = (authorized.case.language || "en").toLowerCase();

  // Skip if we already translated to this language (cache hit).
  const existingLang = isClaimant
    ? authorized.case.claimantStatementFileTranslationLang
    : authorized.case.respondentStatementFileTranslationLang;
  const existingUrl = isClaimant
    ? authorized.case.claimantStatementFileTranslationUrl
    : authorized.case.respondentStatementFileTranslationUrl;
  if (existingLang === targetLang && existingUrl) {
    return {
      translatedUrl: existingUrl,
      targetLang,
      cached: true,
    };
  }

  const spend = await spendForAction(user, {
    actionCode: "document_translate",
    caseId,
    idempotencyKey: `document_translate:${caseId}:${side}:${targetLang}:${Date.now()}`,
    metadata: { side, targetLang, sourceFileName: sourceName },
  });
  if (!spend.success) {
    throw new Error(spend.error || "Insufficient tokens");
  }

  // Pull the original file from blob.
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Blob token not configured");
  }
  const meta = await head(sourceUrl, { token: env.BLOB_READ_WRITE_TOKEN });
  const upstream = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw new Error("Could not download the original document.");
  }
  const sourceBuffer = Buffer.from(await upstream.arrayBuffer());

  // Send to DeepL.
  const translated = await translateDocument({
    buffer: sourceBuffer,
    fileName: sourceName ?? "statement",
    contentType: meta.contentType,
    targetLang,
  });

  // Save translated bytes back to blob with a recognizable pathname.
  const translatedFileName = `${(sourceName ?? "statement").replace(/\.[^.]+$/, "")}.${targetLang}${
    translated.fileName.match(/\.[^.]+$/)?.[0] ?? ""
  }`;
  const blobPath = `cases/${caseId}/translations/${Date.now()}-${translatedFileName.replace(
    /[^a-zA-Z0-9._-]/g,
    "_",
  )}`;
  const uploaded = await uploadBlob({
    pathname: blobPath,
    body: translated.translatedBlob,
    contentType: translated.contentType,
  });

  // Persist translation columns.
  const db = getDb();
  const update = isClaimant
    ? {
        claimantStatementFileTranslationUrl: uploaded.url,
        claimantStatementFileTranslationPathname: uploaded.pathname,
        claimantStatementFileTranslationName: translatedFileName,
        claimantStatementFileTranslationLang: targetLang,
      }
    : {
        respondentStatementFileTranslationUrl: uploaded.url,
        respondentStatementFileTranslationPathname: uploaded.pathname,
        respondentStatementFileTranslationName: translatedFileName,
        respondentStatementFileTranslationLang: targetLang,
      };

  await db.update(cases).set(update).where(eq(cases.id, caseId)).returning();

  await createCaseActivity(
    caseId,
    "note",
    "Document translated",
    `${side} statement document translated to ${targetLang} (${translated.billedCharacters.toLocaleString()} chars).`,
    { user, impersonation: authorized.impersonation },
  );

  return {
    translatedUrl: uploaded.url,
    targetLang,
    cached: false,
    billedCharacters: translated.billedCharacters,
  };
}
