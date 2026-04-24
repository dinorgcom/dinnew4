import { index, integer, jsonb, pgTable, text, timestamp, uuid, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import {
  activityTypeEnum,
  evidenceTypeEnum,
  expertiseStatusEnum,
  messageSenderRoleEnum,
  participantKindEnum,
  recordStatusEnum,
} from "./enums";
import { createdAt, id, updatedAt } from "./common";
import { cases } from "./cases";
import { kycVerifications } from "./kyc";

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
    country: text("country"),
    language: text("language"),
    relationship: text("relationship"),
    calledBy: participantKindEnum("called_by").notNull(),
    statement: text("statement"),
    statementFileUrl: text("statement_file_url"),
    statementFilePathname: text("statement_file_pathname"),
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
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("consultants_case_idx").on(table.caseId),
    tokenIdx: uniqueIndex("consultants_invitation_token_idx").on(table.invitationToken),
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
