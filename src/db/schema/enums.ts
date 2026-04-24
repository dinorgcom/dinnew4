import { pgEnum } from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["user", "moderator", "admin"]);
export const accountStatusEnum = pgEnum("account_status", ["active", "suspended"]);
export const caseRoleEnum = pgEnum("case_role", ["claimant", "respondent", "moderator", "admin"]);
export const caseStatusEnum = pgEnum("case_status", [
  "draft",
  "filed",
  "under_review",
  "hearing_scheduled",
  "in_arbitration",
  "awaiting_decision",
  "resolved",
  "closed",
  "withdrawn",
]);
export const priorityEnum = pgEnum("case_priority", ["low", "medium", "high", "urgent"]);
export const participantKindEnum = pgEnum("participant_kind", ["claimant", "respondent", "arbitrator"]);
export const evidenceTypeEnum = pgEnum("evidence_type", [
  "document",
  "contract",
  "correspondence",
  "photo",
  "video",
  "audio",
  "financial_record",
  "expert_report",
  "other",
]);
export const recordStatusEnum = pgEnum("record_status", [
  "pending",
  "accepted",
  "rejected",
  "under_review",
  "in_dispute",
  "ai_approved",
  "ai_rejected",
]);
export const expertiseStatusEnum = pgEnum("expertise_status", [
  "draft",
  "generating",
  "ready",
  "published",
  "accepted",
  "rejected",
  "in_dispute",
  "ai_approved",
  "ai_rejected",
]);
export const messageSenderRoleEnum = pgEnum("message_sender_role", [
  "claimant",
  "respondent",
  "arbitrator",
  "system",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "filing",
  "evidence_submitted",
  "witness_added",
  "status_change",
  "hearing_scheduled",
  "message",
  "decision",
  "note",
  "document_request",
  "identity_verified",
  "respondent_linked",
  "other",
]);
export const arbitrationResponseEnum = pgEnum("arbitration_response", [
  "accepted",
  "rejected",
]);
export const tokenLedgerStatusEnum = pgEnum("token_ledger_status", ["pending", "committed", "reversed"]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "not_started",
  "pending",
  "verified",
  "requires_input",
  "canceled",
]);
