#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const options = {
  source: "",
  apply: false,
  allowNonEmpty: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--source") {
    options.source = args[index + 1] || "";
    index += 1;
  } else if (arg === "--apply") {
    options.apply = true;
  } else if (arg === "--allow-non-empty") {
    options.allowNonEmpty = true;
  }
}

if (!options.source) {
  console.error("Usage: npm run import:base44 -- --source <export-path> [--apply] [--allow-non-empty]");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL must be set before running the importer.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

function stripJsonComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(stripJsonComments(raw));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function valueOf(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return null;
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseJsonish(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseJsonishArray(value) {
  const parsed = parseJsonish(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseJsonishObject(value) {
  const parsed = parseJsonish(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function asText(value) {
  return value == null ? null : String(value);
}

function asNumericText(value) {
  if (value == null || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toString() : null;
}

function validUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeCaseStatus(value) {
  const allowed = new Set([
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
  return allowed.has(String(value)) ? String(value) : "draft";
}

function normalizePriority(value) {
  const allowed = new Set(["low", "medium", "high", "urgent"]);
  return allowed.has(String(value)) ? String(value) : "medium";
}

function normalizeParticipantKind(value) {
  const allowed = new Set(["claimant", "respondent", "arbitrator"]);
  return allowed.has(String(value)) ? String(value) : "claimant";
}

function normalizeMessageRole(value) {
  const allowed = new Set(["claimant", "respondent", "arbitrator", "system"]);
  return allowed.has(String(value)) ? String(value) : "system";
}

function normalizeRecordStatus(value) {
  const mapping = {
    pending: "pending",
    accepted: "accepted",
    rejected: "rejected",
    under_review: "under_review",
    in_dispute: "in_dispute",
    ai_approved: "ai_approved",
    ai_rejected: "ai_rejected",
    confirmed: "accepted",
    testified: "accepted",
    unavailable: "rejected",
    withdrawn: "rejected",
    report_submitted: "accepted",
  };
  return mapping[String(value)] || "pending";
}

function normalizeExpertiseStatus(value) {
  const allowed = new Set([
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
  return allowed.has(String(value)) ? String(value) : "draft";
}

function normalizeRole(value) {
  const allowed = new Set(["user", "moderator", "admin"]);
  return allowed.has(String(value)) ? String(value) : "user";
}

function normalizeAccountStatus(value) {
  return value === "suspended" ? "suspended" : "active";
}

async function loadCollections(sourcePath) {
  const resolved = path.resolve(sourcePath);
  const stat = await fs.stat(resolved);

  if (stat.isFile()) {
    const bundle = await readJsonFile(resolved);
    return bundle;
  }

  const names = [
    "User",
    "Case",
    "Evidence",
    "Witness",
    "Consultant",
    "Expertise",
    "Message",
    "CaseActivity",
    "LawyerConversation",
    "CaseAudit",
    "TokenLedger",
    "ProcessedStripeEvent",
    "AdminUserAction",
  ];

  const bundle = {};
  for (const name of names) {
    const candidates = [
      `${name}.json`,
      `${name}.jsonc`,
      `${name.toLowerCase()}.json`,
      `${name.toLowerCase()}.jsonc`,
      `${name}s.json`,
      `${name.toLowerCase()}s.json`,
    ];
    let found = null;
    for (const candidate of candidates) {
      const fullPath = path.join(resolved, candidate);
      if (await pathExists(fullPath)) {
        found = fullPath;
        break;
      }
    }
    if (found) {
      bundle[name] = await readJsonFile(found);
    }
  }

  return bundle;
}

function collectionFrom(bundle, name) {
  const variants = [name, name.toLowerCase(), `${name}s`, `${name.toLowerCase()}s`];
  for (const key of variants) {
    const value = bundle[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function makeReporter() {
  return {
    inserted: {},
    skipped: {},
    warnings: [],
    count(table, kind) {
      this[kind][table] = (this[kind][table] || 0) + 1;
    },
    warn(message) {
      this.warnings.push(message);
    },
  };
}

async function queryCount(table) {
  const rows = await sql(`select count(*)::int as count from ${table}`);
  return rows[0]?.count || 0;
}

async function insertRow(statement, params, reporter, table) {
  if (options.apply) {
    await sql(statement, params);
  }
  reporter.count(table, "inserted");
}

const bundle = await loadCollections(options.source);
const reporter = makeReporter();

if (!options.allowNonEmpty) {
  const [userCount, caseCount] = await Promise.all([queryCount("users"), queryCount("cases")]);
  if (userCount > 0 || caseCount > 0) {
    console.error("Target database is not empty. Re-run with --allow-non-empty if that is intentional.");
    process.exit(1);
  }
}

const legacyUsers = collectionFrom(bundle, "User");
const legacyCases = collectionFrom(bundle, "Case");
const legacyEvidence = collectionFrom(bundle, "Evidence");
const legacyWitnesses = collectionFrom(bundle, "Witness");
const legacyConsultants = collectionFrom(bundle, "Consultant");
const legacyExpertise = collectionFrom(bundle, "Expertise");
const legacyMessages = collectionFrom(bundle, "Message");
const legacyActivities = collectionFrom(bundle, "CaseActivity");
const legacyConversations = collectionFrom(bundle, "LawyerConversation");
const legacyAudits = collectionFrom(bundle, "CaseAudit");
const legacyLedger = collectionFrom(bundle, "TokenLedger");
const legacyStripeEvents = collectionFrom(bundle, "ProcessedStripeEvent");
const legacyAdminActions = collectionFrom(bundle, "AdminUserAction");

const userIdMap = new Map();
const caseIdMap = new Map();

for (const row of legacyUsers) {
  const legacyId = asText(valueOf(row, "id", "_id"));
  const nextId = randomUUID();
  const email = asText(valueOf(row, "email", "primary_email")) || `legacy-${nextId}@import.local`;
  const fullName =
    asText(valueOf(row, "full_name", "fullName"))
    || [valueOf(row, "first_name"), valueOf(row, "last_name")].filter(Boolean).join(" ")
    || null;
  const role = normalizeRole(valueOf(row, "role"));
  const accountStatus = normalizeAccountStatus(valueOf(row, "account_status", "accountStatus"));
  const suspensionReason = asText(valueOf(row, "suspension_reason", "suspensionReason"));
  const suspendedAt = toDate(valueOf(row, "suspended_at", "suspendedAt"));
  const createdAt = toDate(valueOf(row, "created_at", "created_date", "createdAt"));
  const updatedAt = toDate(valueOf(row, "updated_at", "updated_date", "updatedAt"));

  await insertRow(
    `insert into users (
      id, clerk_user_id, email, full_name, role, account_status, suspension_reason,
      suspended_at, suspended_by_user_id, metadata_json, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
    )`,
    [
      nextId,
      asText(valueOf(row, "clerk_user_id", "clerkUserId")) || `legacy:${legacyId || email}`,
      email,
      fullName,
      role,
      accountStatus,
      suspensionReason,
      suspendedAt,
      asText(valueOf(row, "suspended_by", "suspendedBy")),
      JSON.stringify({ imported_from: "base44", legacy_id: legacyId }),
      createdAt,
      updatedAt,
    ],
    reporter,
    "users",
  );

  if (legacyId) {
    userIdMap.set(legacyId, nextId);
  }
}

for (const row of legacyCases) {
  const legacyId = asText(valueOf(row, "id", "_id"));
  const nextId = randomUUID();
  const createdAt = toDate(valueOf(row, "created_at", "created_date", "createdAt"));
  const updatedAt = toDate(valueOf(row, "updated_at", "updated_date", "updatedAt"));
  const proposal = parseJsonish(valueOf(row, "arbitration_proposal", "arbitrationProposal"), null);
  const judgement = parseJsonish(valueOf(row, "judgement_data", "judgementJson"), null);

  await insertRow(
    `insert into cases (
      id, case_number, title, description, category, status, priority, claim_amount, currency,
      filing_date, hearing_date, resolution_deadline, claimant_name, claimant_email, claimant_phone,
      respondent_name, respondent_email, respondent_phone, claimant_claims, respondent_claims,
      arbitrator_assigned_name, arbitrator_assigned_user_id, claimant_lawyer_key, ai_suggestion,
      arbitration_proposal_json, judgement_json, final_decision, settlement_amount, notes, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,
      $16,$17,$18,$19,$20,
      $21,$22,$23,$24,
      $25,$26,$27,$28,$29,$30,$31
    )`,
    [
      nextId,
      asText(valueOf(row, "case_number", "caseNumber")) || `LEGACY-${nextId.slice(0, 8).toUpperCase()}`,
      asText(valueOf(row, "title")) || "Imported case",
      asText(valueOf(row, "description")),
      asText(valueOf(row, "category")) || "other",
      normalizeCaseStatus(valueOf(row, "status")),
      normalizePriority(valueOf(row, "priority")),
      asNumericText(valueOf(row, "claim_amount", "claimAmount")),
      asText(valueOf(row, "currency")) || "USD",
      toDate(valueOf(row, "filing_date", "filingDate")),
      toDate(valueOf(row, "hearing_date", "hearingDate")),
      toDate(valueOf(row, "resolution_deadline", "resolutionDeadline")),
      asText(valueOf(row, "claimant_name", "claimantName")),
      asText(valueOf(row, "claimant_email", "claimantEmail")),
      asText(valueOf(row, "claimant_phone", "claimantPhone")),
      asText(valueOf(row, "respondent_name", "respondentName")),
      asText(valueOf(row, "respondent_email", "respondentEmail")),
      asText(valueOf(row, "respondent_phone", "respondentPhone")),
      JSON.stringify(parseJsonishArray(valueOf(row, "claimant_claims", "claimantClaims"))),
      JSON.stringify(parseJsonishArray(valueOf(row, "respondent_claims", "respondentClaims"))),
      asText(valueOf(row, "arbitrator_assigned", "arbitratorAssignedName")),
      userIdMap.get(asText(valueOf(row, "arbitrator_assigned_user_id", "arbitratorAssignedUserId")) || "") || null,
      asText(valueOf(row, "claimant_lawyer", "claimant_lawyer_key", "claimantLawyerKey")),
      asText(valueOf(row, "ai_suggestion", "aiSuggestion")),
      proposal ? JSON.stringify(proposal) : null,
      judgement ? JSON.stringify(judgement) : null,
      asText(valueOf(row, "final_decision", "finalDecision")),
      asNumericText(valueOf(row, "settlement_amount", "settlementAmount")),
      asText(valueOf(row, "notes")),
      createdAt,
      updatedAt,
    ],
    reporter,
    "cases",
  );

  if (legacyId) {
    caseIdMap.set(legacyId, nextId);
  }
}

function mappedCaseId(row, table) {
  const legacyCaseId = asText(valueOf(row, "case_id", "caseId"));
  const nextCaseId = legacyCaseId ? caseIdMap.get(legacyCaseId) : null;
  if (!nextCaseId) {
    reporter.count(table, "skipped");
    reporter.warn(`${table}: skipped record with missing case reference ${legacyCaseId || "<empty>"}`);
    return null;
  }
  return nextCaseId;
}

function mappedUserId(legacyId) {
  return legacyId ? userIdMap.get(legacyId) || null : null;
}

for (const row of legacyEvidence) {
  const caseId = mappedCaseId(row, "evidence");
  if (!caseId) continue;
  await insertRow(
    `insert into evidence (
      id, case_id, evidence_number, title, description, type, status, submitted_by, file_url,
      file_name, confidential, discussion, discussion_deadline, rejected_by, original_evidence_id,
      notes, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,
      $16,$17,$18
    )`,
    [
      randomUUID(),
      caseId,
      Number(valueOf(row, "evidence_number", "evidenceNumber")) || null,
      asText(valueOf(row, "title")) || "Imported evidence",
      asText(valueOf(row, "description")),
      asText(valueOf(row, "type")) || "other",
      normalizeRecordStatus(valueOf(row, "status")),
      normalizeParticipantKind(valueOf(row, "submitted_by", "submittedBy")),
      asText(valueOf(row, "file_url", "fileUrl")),
      asText(valueOf(row, "file_name", "fileName")),
      Boolean(valueOf(row, "confidential")),
      JSON.stringify(parseJsonishArray(valueOf(row, "discussion"))),
      toDate(valueOf(row, "discussion_deadline", "discussionDeadline")),
      asText(valueOf(row, "rejected_by", "rejectedBy")),
      validUuid(asText(valueOf(row, "original_evidence_id", "originalEvidenceId"))) ? asText(valueOf(row, "original_evidence_id", "originalEvidenceId")) : null,
      asText(valueOf(row, "notes")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "evidence",
  );
}

for (const row of legacyWitnesses) {
  const caseId = mappedCaseId(row, "witnesses");
  if (!caseId) continue;
  await insertRow(
    `insert into witnesses (
      id, case_id, full_name, email, phone, address, country, language, relationship, called_by,
      statement, statement_file_url, availability, testimony_date, status, discussion, discussion_deadline,
      rejected_by, notes, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,
      $18,$19,$20,$21
    )`,
    [
      randomUUID(),
      caseId,
      asText(valueOf(row, "full_name", "fullName")) || "Imported witness",
      asText(valueOf(row, "email")),
      asText(valueOf(row, "phone")),
      asText(valueOf(row, "address")),
      asText(valueOf(row, "country")),
      asText(valueOf(row, "language")),
      asText(valueOf(row, "relationship")),
      normalizeParticipantKind(valueOf(row, "called_by", "calledBy")),
      asText(valueOf(row, "statement")),
      asText(valueOf(row, "statement_file_url", "statementFileUrl")),
      asText(valueOf(row, "availability")),
      toDate(valueOf(row, "testimony_date", "testimonyDate")),
      normalizeRecordStatus(valueOf(row, "status")),
      JSON.stringify(parseJsonishArray(valueOf(row, "discussion"))),
      toDate(valueOf(row, "discussion_deadline", "discussionDeadline")),
      asText(valueOf(row, "rejected_by", "rejectedBy")),
      asText(valueOf(row, "notes")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "witnesses",
  );
}

for (const row of legacyConsultants) {
  const caseId = mappedCaseId(row, "consultants");
  if (!caseId) continue;
  await insertRow(
    `insert into consultants (
      id, case_id, full_name, email, phone, company, expertise, role, called_by,
      report, report_file_url, status, discussion, discussion_deadline, rejected_by, notes, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,
      $10,$11,$12,$13,$14,$15,$16,$17,$18
    )`,
    [
      randomUUID(),
      caseId,
      asText(valueOf(row, "full_name", "fullName")) || "Imported consultant",
      asText(valueOf(row, "email")),
      asText(valueOf(row, "phone")),
      asText(valueOf(row, "company")),
      asText(valueOf(row, "expertise")),
      asText(valueOf(row, "role")),
      normalizeParticipantKind(valueOf(row, "called_by", "calledBy")),
      asText(valueOf(row, "report")),
      asText(valueOf(row, "report_file_url", "reportFileUrl")),
      normalizeRecordStatus(valueOf(row, "status")),
      JSON.stringify(parseJsonishArray(valueOf(row, "discussion"))),
      toDate(valueOf(row, "discussion_deadline", "discussionDeadline")),
      asText(valueOf(row, "rejected_by", "rejectedBy")),
      asText(valueOf(row, "notes")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "consultants",
  );
}

for (const row of legacyExpertise) {
  const caseId = mappedCaseId(row, "expertise_requests");
  if (!caseId) continue;
  const fileUrls = asArray(valueOf(row, "file_urls", "fileUrls")).map((url, index) => ({
    url,
    pathname: `legacy/${caseId}/${index}`,
    fileName: `legacy-file-${index + 1}`,
  }));

  await insertRow(
    `insert into expertise_requests (
      id, case_id, requested_by, title, description, file_references, ai_analysis, status,
      is_published, discussion, discussion_deadline, rejected_by, notes, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,$12,$13,$14,$15
    )`,
    [
      randomUUID(),
      caseId,
      asText(valueOf(row, "requested_by", "requestedBy")) || "claimant",
      asText(valueOf(row, "title")) || "Imported expertise",
      asText(valueOf(row, "description")),
      JSON.stringify(fileUrls),
      asText(valueOf(row, "ai_analysis", "aiAnalysis")),
      normalizeExpertiseStatus(valueOf(row, "status")),
      Boolean(valueOf(row, "is_published", "isPublished")),
      JSON.stringify(parseJsonishArray(valueOf(row, "discussion"))),
      toDate(valueOf(row, "discussion_deadline", "discussionDeadline")),
      asText(valueOf(row, "rejected_by", "rejectedBy")),
      asText(valueOf(row, "notes")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "expertise_requests",
  );
}

for (const row of legacyMessages) {
  const caseId = mappedCaseId(row, "case_messages");
  if (!caseId) continue;
  await insertRow(
    `insert into case_messages (
      id, case_id, sender_role, sender_name, content, attachment_url, attachment_name, is_read, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    )`,
    [
      randomUUID(),
      caseId,
      normalizeMessageRole(valueOf(row, "sender_role", "senderRole")),
      asText(valueOf(row, "sender_name", "senderName")),
      asText(valueOf(row, "content")) || "",
      asText(valueOf(row, "attachment_url", "attachmentUrl")),
      asText(valueOf(row, "attachment_name", "attachmentName")),
      Boolean(valueOf(row, "is_read", "isRead")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "case_messages",
  );
}

for (const row of legacyActivities) {
  const caseId = mappedCaseId(row, "case_activities");
  if (!caseId) continue;
  await insertRow(
    `insert into case_activities (
      id, case_id, type, title, description, performed_by, metadata_json, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9
    )`,
    [
      randomUUID(),
      caseId,
      asText(valueOf(row, "type")) || "other",
      asText(valueOf(row, "title")) || "Imported activity",
      asText(valueOf(row, "description")),
      asText(valueOf(row, "performed_by", "performedBy")),
      JSON.stringify(parseJsonishObject(valueOf(row, "metadata", "metadata_json", "metadataJson"))),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "case_activities",
  );
}

for (const row of legacyConversations) {
  const caseId = mappedCaseId(row, "lawyer_conversations");
  if (!caseId) continue;
  const legacyUserId = asText(valueOf(row, "user_id", "userId"));
  const messages = parseJsonishArray(valueOf(row, "messages", "messages_json", "messagesJson")).map((item) => ({
    role: item.role === "lawyer" ? "assistant" : item.role === "user" ? "user" : "system",
    content: item.content || "",
    createdAt: toDate(item.timestamp || item.createdAt) || new Date().toISOString(),
  }));

  await insertRow(
    `insert into lawyer_conversations (
      id, case_id, user_id, user_email, lawyer_personality, party_role, messages_json,
      context_summary, case_phase, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11
    )`,
    [
      randomUUID(),
      caseId,
      mappedUserId(legacyUserId),
      asText(valueOf(row, "user_email", "userEmail")) || "unknown@import.local",
      asText(valueOf(row, "lawyer_personality", "lawyerPersonality")) || "strategic",
      asText(valueOf(row, "party_role", "partyRole")) || "claimant",
      JSON.stringify(messages),
      asText(valueOf(row, "context_summary", "contextSummary")),
      asText(valueOf(row, "case_phase", "casePhase")) || "onboarding",
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "lawyer_conversations",
  );
}

for (const row of legacyAudits) {
  const caseId = mappedCaseId(row, "case_audits");
  if (!caseId) continue;
  await insertRow(
    `insert into case_audits (
      id, case_id, requested_by_user_id, requested_by_role, requested_at, title, snapshot_json,
      audit_json, pdf_file_name, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11
    )`,
    [
      randomUUID(),
      caseId,
      mappedUserId(asText(valueOf(row, "requested_by_user_id", "requestedByUserId"))),
      asText(valueOf(row, "requested_by_role", "requestedByRole")) || "claimant",
      toDate(valueOf(row, "requested_at", "requestedAt")) || new Date().toISOString(),
      asText(valueOf(row, "title")),
      JSON.stringify(parseJsonishObject(valueOf(row, "snapshot_json", "snapshotJson"))),
      JSON.stringify(parseJsonishObject(valueOf(row, "audit_json", "auditJson"))),
      asText(valueOf(row, "pdf_file_name", "pdfFileName")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "case_audits",
  );
}

for (const row of legacyLedger) {
  const legacyUserId = asText(valueOf(row, "user_id", "userId"));
  const userId = mappedUserId(legacyUserId);
  if (!userId) {
    reporter.count("token_ledger", "skipped");
    reporter.warn(`token_ledger: skipped record with missing user reference ${legacyUserId || "<empty>"}`);
    continue;
  }

  const legacyCaseId = asText(valueOf(row, "case_id", "caseId"));
  await insertRow(
    `insert into token_ledger (
      id, user_id, case_id, delta, kind, status, idempotency_key, stripe_session_id,
      stripe_event_id, metadata_json, created_by, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11,$12,$13
    )`,
    [
      randomUUID(),
      userId,
      legacyCaseId ? caseIdMap.get(legacyCaseId) || null : null,
      Number(valueOf(row, "delta")) || 0,
      asText(valueOf(row, "kind")) || "legacy_import",
      asText(valueOf(row, "status")) || "committed",
      asText(valueOf(row, "idempotency_key", "idempotencyKey")) || `legacy-ledger:${randomUUID()}`,
      asText(valueOf(row, "stripe_session_id", "stripeSessionId")),
      asText(valueOf(row, "stripe_event_id", "stripeEventId")),
      JSON.stringify(parseJsonishObject(valueOf(row, "metadata_json", "metadataJson"))),
      asText(valueOf(row, "created_by", "createdBy")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "token_ledger",
  );
}

for (const row of legacyStripeEvents) {
  const legacyUserId = asText(valueOf(row, "user_id", "userId"));
  const userId = mappedUserId(legacyUserId);
  if (!userId) {
    reporter.count("processed_stripe_events", "skipped");
    reporter.warn(`processed_stripe_events: skipped record with missing user reference ${legacyUserId || "<empty>"}`);
    continue;
  }
  await insertRow(
    `insert into processed_stripe_events (
      id, event_id, session_id, user_id, package_id, credited_tokens, processed_at, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,$9
    )`,
    [
      randomUUID(),
      asText(valueOf(row, "event_id", "eventId")) || `legacy-event:${randomUUID()}`,
      asText(valueOf(row, "session_id", "sessionId")) || `legacy-session:${randomUUID()}`,
      userId,
      asText(valueOf(row, "package_id", "packageId")) || "legacy",
      Number(valueOf(row, "credited_tokens", "creditedTokens")) || 0,
      toDate(valueOf(row, "processed_at", "processedAt")) || new Date().toISOString(),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "processed_stripe_events",
  );
}

for (const row of legacyAdminActions) {
  await insertRow(
    `insert into admin_user_actions (
      id, admin_user_id, admin_email, target_user_id, target_email, action, before_json, after_json,
      reason, created_at, updated_at
    ) values (
      $1,$2,$3,$4,$5,$6,$7,$8,
      $9,$10,$11
    )`,
    [
      randomUUID(),
      mappedUserId(asText(valueOf(row, "admin_user_id", "adminUserId"))),
      asText(valueOf(row, "admin_email", "adminEmail")),
      mappedUserId(asText(valueOf(row, "target_user_id", "targetUserId"))),
      asText(valueOf(row, "target_email", "targetEmail")),
      asText(valueOf(row, "action")) || "legacy_import",
      JSON.stringify(parseJsonishObject(valueOf(row, "before_json", "beforeJson"))),
      JSON.stringify(parseJsonishObject(valueOf(row, "after_json", "afterJson"))),
      asText(valueOf(row, "reason")),
      toDate(valueOf(row, "created_at", "created_date", "createdAt")),
      toDate(valueOf(row, "updated_at", "updated_date", "updatedAt")),
    ],
    reporter,
    "admin_user_actions",
  );
}

console.log(options.apply ? "Base44 import applied." : "Dry run completed. Re-run with --apply to write data.");
console.log(JSON.stringify(reporter, null, 2));
