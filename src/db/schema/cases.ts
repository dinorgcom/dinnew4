import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { arbitrationResponseEnum, caseStatusEnum, priorityEnum } from "./enums";
import { createdAt, id, updatedAt } from "./common";
import { users } from "./users";
import { kycVerifications } from "./kyc";

export const cases = pgTable(
  "cases",
  {
    id,
    caseNumber: text("case_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category"),
    status: caseStatusEnum("status").default("draft").notNull(),
    priority: priorityEnum("priority").default("medium").notNull(),
    claimAmount: numeric("claim_amount", { precision: 12, scale: 2 }),
    currency: text("currency").default("USD").notNull(),
    // ISO 639-1 lower-case language code. Drives the language for AI
    // outputs (sanitized statement, judgement, audit), notification
    // emails, and what document translations are produced into.
    language: text("language").default("en").notNull(),
    filingDate: timestamp("filing_date", { withTimezone: true }),
    resolutionDeadline: timestamp("resolution_deadline", { withTimezone: true }),
    claimantName: text("claimant_name"),
    claimantEmail: text("claimant_email"),
    claimantPhone: text("claimant_phone"),
    claimantAddress: text("claimant_address"),
    claimantCity: text("claimant_city"),
    claimantPostalCode: text("claimant_postal_code"),
    claimantCountry: text("claimant_country"),
    claimantUserId: uuid("claimant_user_id").references(() => users.id, { onDelete: "set null" }),
    claimantKycVerificationId: uuid("claimant_kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    claimantNameVerified: text("claimant_name_verified"),
    respondentName: text("respondent_name"),
    respondentEmail: text("respondent_email"),
    respondentPhone: text("respondent_phone"),
    respondentAddress: text("respondent_address"),
    respondentCity: text("respondent_city"),
    respondentPostalCode: text("respondent_postal_code"),
    respondentCountry: text("respondent_country"),
    respondentNameAlleged: text("respondent_name_alleged"),
    respondentEmailAlleged: text("respondent_email_alleged"),
    respondentUserId: uuid("respondent_user_id").references(() => users.id, { onDelete: "set null" }),
    respondentKycVerificationId: uuid("respondent_kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    respondentNameVerified: text("respondent_name_verified"),
    respondentLinkedAt: timestamp("respondent_linked_at", { withTimezone: true }),
    claimantClaims: jsonb("claimant_claims").$type<Record<string, unknown>[]>(),
    respondentClaims: jsonb("respondent_claims").$type<Record<string, unknown>[]>(),
    // Plain-text statements that replace the structured claims arrays.
    // Each side writes a single free-form statement of their position;
    // the legacy claimant_claims / respondent_claims jsonb columns are
    // kept for back-compat with old rows but no longer written by the UI.
    claimantStatement: text("claimant_statement"),
    respondentStatement: text("respondent_statement"),
    // Optional document upload that backs the free-form statement —
    // typically a PDF or Word file containing the original pleading.
    claimantStatementFileUrl: text("claimant_statement_file_url"),
    claimantStatementFilePathname: text("claimant_statement_file_pathname"),
    claimantStatementFileName: text("claimant_statement_file_name"),
    respondentStatementFileUrl: text("respondent_statement_file_url"),
    respondentStatementFilePathname: text("respondent_statement_file_pathname"),
    respondentStatementFileName: text("respondent_statement_file_name"),
    // Cached DeepL translation of the statement document, keyed implicitly
    // by (case, side). Re-translation overwrites these columns.
    claimantStatementFileTranslationUrl: text("claimant_statement_file_translation_url"),
    claimantStatementFileTranslationPathname: text("claimant_statement_file_translation_pathname"),
    claimantStatementFileTranslationName: text("claimant_statement_file_translation_name"),
    claimantStatementFileTranslationLang: text("claimant_statement_file_translation_lang"),
    respondentStatementFileTranslationUrl: text("respondent_statement_file_translation_url"),
    respondentStatementFileTranslationPathname: text("respondent_statement_file_translation_pathname"),
    respondentStatementFileTranslationName: text("respondent_statement_file_translation_name"),
    respondentStatementFileTranslationLang: text("respondent_statement_file_translation_lang"),
    arbitratorAssignedName: text("arbitrator_assigned_name"),
    arbitratorAssignedUserId: text("arbitrator_assigned_user_id"),
    claimantLawyerKey: text("claimant_lawyer_key"),
    respondentLawyerKey: text("respondent_lawyer_key"),
    aiSuggestion: text("ai_suggestion"),
    arbitrationProposalJson: jsonb("arbitration_proposal_json").$type<Record<string, unknown> | null>(),
    arbitrationClaimantResponse: arbitrationResponseEnum("arbitration_claimant_response"),
    arbitrationRespondentResponse: arbitrationResponseEnum("arbitration_respondent_response"),
    judgementJson: jsonb("judgement_json").$type<Record<string, unknown> | null>(),
    finalDecision: text("final_decision"),
    settlementAmount: numeric("settlement_amount", { precision: 12, scale: 2 }),
    discoveryReadyClaimantAt: timestamp("discovery_ready_claimant_at", { withTimezone: true }),
    discoveryReadyRespondentAt: timestamp("discovery_ready_respondent_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    // Reference to current simulation
    currentSimulationId: text("current_simulation_id"),
    notes: text("notes"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseNumberIdx: index("cases_case_number_idx").on(table.caseNumber),
    statusIdx: index("cases_status_idx").on(table.status),
    claimantEmailIdx: index("cases_claimant_email_idx").on(table.claimantEmail),
    respondentEmailIdx: index("cases_respondent_email_idx").on(table.respondentEmail),
    currentSimulationIdIdx: index("cases_current_simulation_id_idx").on(table.currentSimulationId),
  }),
);
