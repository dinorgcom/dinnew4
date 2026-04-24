import { index, jsonb, pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { tokenLedgerStatusEnum } from "./enums";
import { createdAt, id, updatedAt } from "./common";
import { cases } from "./cases";
import { users } from "./users";

export const lawyerConversations = pgTable(
  "lawyer_conversations",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    userEmail: text("user_email").notNull(),
    lawyerPersonality: text("lawyer_personality").notNull(),
    partyRole: text("party_role").notNull(),
    messagesJson: jsonb("messages_json").$type<Record<string, unknown>[]>(),
    contextSummary: text("context_summary"),
    casePhase: text("case_phase").default("onboarding").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("lawyer_conversations_case_idx").on(table.caseId),
  }),
);

export const caseAudits = pgTable(
  "case_audits",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    requestedByRole: text("requested_by_role").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    title: text("title"),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>().notNull(),
    auditJson: jsonb("audit_json").$type<Record<string, unknown>>().notNull(),
    pdfFileName: text("pdf_file_name"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("case_audits_case_idx").on(table.caseId),
  }),
);

export const tokenLedger = pgTable(
  "token_ledger",
  {
    id,
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    delta: integer("delta").notNull(),
    kind: text("kind").notNull(),
    status: tokenLedgerStatusEnum("status").default("committed").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    stripeSessionId: text("stripe_session_id"),
    stripeEventId: text("stripe_event_id"),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown> | null>(),
    createdBy: text("created_by"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdx: index("token_ledger_user_idx").on(table.userId),
    idempotencyIdx: index("token_ledger_idempotency_idx").on(table.idempotencyKey),
  }),
);

export const processedStripeEvents = pgTable(
  "processed_stripe_events",
  {
    id,
    eventId: text("event_id").notNull(),
    sessionId: text("session_id").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    packageId: text("package_id").notNull(),
    creditedTokens: integer("credited_tokens").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => ({
    eventIdx: index("processed_stripe_events_event_idx").on(table.eventId),
  }),
);

export const adminUserActions = pgTable(
  "admin_user_actions",
  {
    id,
    adminUserId: uuid("admin_user_id").references(() => users.id, { onDelete: "set null" }),
    adminEmail: text("admin_email"),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    targetEmail: text("target_email"),
    action: text("action").notNull(),
    beforeJson: jsonb("before_json").$type<Record<string, unknown>>().notNull(),
    afterJson: jsonb("after_json").$type<Record<string, unknown>>().notNull(),
    reason: text("reason"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    targetIdx: index("admin_user_actions_target_idx").on(table.targetUserId),
  }),
);
