import { AnyPgColumn, index, integer, jsonb, pgTable, text, timestamp, uuid, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import {
  activityTypeEnum,
  evidenceTypeEnum,
  expertiseStatusEnum,
  messageSenderRoleEnum,
  participantKindEnum,
  partySideEnum,
  partyStatusEnum,
  recordStatusEnum,
} from "./enums";
import { createdAt, id, updatedAt } from "./common";
import { cases } from "./cases";
import { kycVerifications } from "./kyc";
import { users } from "./users";

export const evidence = pgTable(
  "evidence",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    evidenceNumber: integer("evidence_number"),
    title: text("title").notNull(),
    description: text("description"),
    type: evidenceTypeEnum("type").notNull(),
    status: recordStatusEnum("status").default("pending").notNull(),
    submittedBy: participantKindEnum("submitted_by"),
    fileUrl: text("file_url"),
    filePathname: text("file_pathname"),
    fileName: text("file_name"),
    contentType: text("content_type"),
    fileSize: integer("file_size"),
    confidential: boolean("confidential").default(false).notNull(),
    discussion: jsonb("discussion").$type<Record<string, unknown>[]>(),
    discussionDeadline: timestamp("discussion_deadline", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    originalEvidenceId: uuid("original_evidence_id"),
    notes: text("notes"),
    contextJson: jsonb("context_json").$type<{
      whatThisEvidenceIs?: string | null;
      whatThisEvidenceShows?: string | null;
      importantDatesOrEvents?: string | null;
      relatedClaimOrDefense?: string | null;
      peopleOrCompaniesInvolved?: string | null;
      authenticityOrCompleteness?: string | null;
      conclusionForJudge?: string | null;
    } | null>(),
    reviewState: text("review_state").default("pending"),
    reviewExtensions: integer("review_extensions").default(0).notNull(),
    reviewDismissalReason: text("review_dismissal_reason"),
    reviewDismissalFileUrl: text("review_dismissal_file_url"),
    reviewDismissalFilePathname: text("review_dismissal_file_pathname"),
    reviewDismissalFileName: text("review_dismissal_file_name"),
    reviewExpertiseRequestId: uuid("review_expertise_request_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("evidence_case_idx").on(table.caseId),
  }),
);

export const witnesses = pgTable(
  "witnesses",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    language: text("language"),
    relationship: text("relationship"),
    calledBy: participantKindEnum("called_by").notNull(),
    statement: text("statement"),
    statementFileUrl: text("statement_file_url"),
    statementFilePathname: text("statement_file_pathname"),
    photoUrl: text("photo_url"),
    photoPathname: text("photo_pathname"),
    availability: text("availability"),
    testimonyDate: timestamp("testimony_date", { withTimezone: true }),
    status: recordStatusEnum("status").default("pending").notNull(),
    discussion: jsonb("discussion").$type<Record<string, unknown>[]>(),
    discussionDeadline: timestamp("discussion_deadline", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    notes: text("notes"),
    invitationToken: text("invitation_token"),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at", { withTimezone: true }),
    kycVerificationId: uuid("kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    originalFullName: text("original_full_name"),
    nameUpdatedAt: timestamp("name_updated_at", { withTimezone: true }),
    reviewState: text("review_state").default("pending"),
    reviewExtensions: integer("review_extensions").default(0).notNull(),
    reviewDismissalReason: text("review_dismissal_reason"),
    reviewDismissalFileUrl: text("review_dismissal_file_url"),
    reviewDismissalFilePathname: text("review_dismissal_file_pathname"),
    reviewDismissalFileName: text("review_dismissal_file_name"),
    reviewExpertiseRequestId: uuid("review_expertise_request_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("witnesses_case_idx").on(table.caseId),
    tokenIdx: uniqueIndex("witnesses_invitation_token_idx").on(table.invitationToken),
  }),
);

export const consultants = pgTable(
  "consultants",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    company: text("company"),
    expertise: text("expertise"),
    role: text("role"),
    calledBy: participantKindEnum("called_by").notNull(),
    report: text("report"),
    reportFileUrl: text("report_file_url"),
    reportFilePathname: text("report_file_pathname"),
    status: recordStatusEnum("status").default("pending").notNull(),
    discussion: jsonb("discussion").$type<Record<string, unknown>[]>(),
    discussionDeadline: timestamp("discussion_deadline", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    notes: text("notes"),
    invitationToken: text("invitation_token"),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at", { withTimezone: true }),
    kycVerificationId: uuid("kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    originalFullName: text("original_full_name"),
    nameUpdatedAt: timestamp("name_updated_at", { withTimezone: true }),
    reviewState: text("review_state").default("pending"),
    reviewExtensions: integer("review_extensions").default(0).notNull(),
    reviewDismissalReason: text("review_dismissal_reason"),
    reviewDismissalFileUrl: text("review_dismissal_file_url"),
    reviewDismissalFilePathname: text("review_dismissal_file_pathname"),
    reviewDismissalFileName: text("review_dismissal_file_name"),
    reviewExpertiseRequestId: uuid("review_expertise_request_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("consultants_case_idx").on(table.caseId),
    tokenIdx: uniqueIndex("consultants_invitation_token_idx").on(table.invitationToken),
  }),
);

export const lawyers = pgTable(
  "lawyers",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    firmName: text("firm_name"),
    firmUrl: text("firm_url"),
    proofFileUrl: text("proof_file_url"),
    proofFilePathname: text("proof_file_pathname"),
    proofFileName: text("proof_file_name"),
    calledBy: participantKindEnum("called_by").notNull(),
    notes: text("notes"),
    status: recordStatusEnum("status").default("pending").notNull(),
    discussion: jsonb("discussion").$type<Record<string, unknown>[]>(),
    discussionDeadline: timestamp("discussion_deadline", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    invitationToken: text("invitation_token"),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at", { withTimezone: true }),
    kycVerificationId: uuid("kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    originalFullName: text("original_full_name"),
    nameUpdatedAt: timestamp("name_updated_at", { withTimezone: true }),
    reviewState: text("review_state").default("pending"),
    reviewExtensions: integer("review_extensions").default(0).notNull(),
    reviewDismissalReason: text("review_dismissal_reason"),
    reviewDismissalFileUrl: text("review_dismissal_file_url"),
    reviewDismissalFilePathname: text("review_dismissal_file_pathname"),
    reviewDismissalFileName: text("review_dismissal_file_name"),
    reviewExpertiseRequestId: uuid("review_expertise_request_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("lawyers_case_idx").on(table.caseId),
    tokenIdx: uniqueIndex("lawyers_invitation_token_idx").on(table.invitationToken),
  }),
);

export const expertiseRequests = pgTable(
  "expertise_requests",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    fileReferences: jsonb("file_references").$type<Record<string, unknown>[]>(),
    aiAnalysis: text("ai_analysis"),
    status: expertiseStatusEnum("status").default("draft").notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    discussion: jsonb("discussion").$type<Record<string, unknown>[]>(),
    discussionDeadline: timestamp("discussion_deadline", { withTimezone: true }),
    rejectedBy: text("rejected_by"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("expertise_case_idx").on(table.caseId),
  }),
);

export const witnessQuestions = pgTable(
  "witness_questions",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    witnessId: uuid("witness_id").notNull().references(() => witnesses.id, { onDelete: "cascade" }),
    askingPartyRole: text("asking_party_role").notNull(),
    questionText: text("question_text").notNull(),
    source: text("source").default("manual").notNull(),
    createdByUserId: uuid("created_by_user_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("witness_questions_case_idx").on(table.caseId),
    witnessIdx: index("witness_questions_witness_idx").on(table.witnessId),
  }),
);

export const caseMessages = pgTable(
  "case_messages",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    senderRole: messageSenderRoleEnum("sender_role").notNull(),
    senderName: text("sender_name"),
    content: text("content").notNull(),
    attachmentUrl: text("attachment_url"),
    attachmentPathname: text("attachment_pathname"),
    attachmentName: text("attachment_name"),
    isRead: boolean("is_read").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("case_messages_case_idx").on(table.caseId),
  }),
);

export const caseParties = pgTable(
  "case_parties",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    side: partySideEnum("side").notNull(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kycVerificationId: uuid("kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    nameVerified: text("name_verified"),
    isOriginal: boolean("is_original").default(false).notNull(),
    status: partyStatusEnum("status").default("pending_approval").notNull(),
    invitationToken: text("invitation_token"),
    invitationTokenExpiresAt: timestamp("invitation_token_expires_at", { withTimezone: true }),
    invitedByPartyId: uuid("invited_by_party_id").references((): AnyPgColumn => caseParties.id, { onDelete: "set null" }),
    approvalDeadline: timestamp("approval_deadline", { withTimezone: true }),
    approvalExtensions: integer("approval_extensions").default(0).notNull(),
    approvalVotesJson: jsonb("approval_votes_json").$type<Record<string, "approve" | "reject">>(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("case_parties_case_idx").on(table.caseId),
    emailIdx: index("case_parties_email_idx").on(table.email),
    tokenIdx: uniqueIndex("case_parties_invitation_token_idx").on(table.invitationToken),
  }),
);

export const caseActivities = pgTable(
  "case_activities",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    performedBy: text("performed_by"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("case_activities_case_idx").on(table.caseId),
  }),
);

// Round-based pleading exchange. The classic civil-procedure structure
// is four ordered slots:
//   round 1, claimant   → "Claim" (Klageschrift)
//   round 1, respondent → "Response" (Klagebeantwortung)
//   round 2, claimant   → "Reply" (Replik)
//   round 2, respondent → "Rejoinder" (Duplik)
// Each slot is editable until the side hits "Final submit", which
// stamps `locked_at`. The next slot in the canonical order only opens
// once the predecessor is locked. After all four are locked the
// pleadings phase is complete.
export const pleadings = pgTable(
  "pleadings",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    side: partySideEnum("side").notNull(),
    round: integer("round").notNull(),
    text: text("text"),
    fileUrl: text("file_url"),
    filePathname: text("file_pathname"),
    fileName: text("file_name"),
    translationUrl: text("translation_url"),
    translationPathname: text("translation_pathname"),
    translationName: text("translation_name"),
    translationLang: text("translation_lang"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("pleadings_case_idx").on(table.caseId),
    slotIdx: uniqueIndex("pleadings_slot_idx").on(table.caseId, table.side, table.round),
  }),
);

// Dedup ledger for deadline reminder emails. The cron walks all open
// deadlines daily and inserts one row per (entity, threshold) the first
// time it sends a reminder, so subsequent runs skip the entity. The row
// gets removed (cascade) when the parent case is deleted.
export const deadlineRemindersSent = pgTable(
  "deadline_reminders_sent",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    threshold: text("threshold").notNull(),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    caseIdx: index("deadline_reminders_case_idx").on(table.caseId),
    uniqueEntity: uniqueIndex("deadline_reminders_unique_idx").on(
      table.entityType,
      table.entityId,
      table.threshold,
    ),
  }),
);
