import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";

export const hearings = pgTable(
  "hearings",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(), // Back to uuid type
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }), // Use uuid type for foreign key
    
    // Hearing Scheduling
    scheduledStartTime: timestamp("scheduled_start_time", { withTimezone: true }).notNull(),
    scheduledEndTime: timestamp("scheduled_end_time", { withTimezone: true }),
    actualStartTime: timestamp("actual_start_time", { withTimezone: true }),
    actualEndTime: timestamp("actual_end_time", { withTimezone: true }),
    
    // Meeting Information
    meetingUrl: text("meeting_url"),
    meetingPlatform: text("meeting_platform").default("anam"), // "anam", "zoom", "teams"
    meetingId: text("meeting_id"), // Platform-specific meeting ID
    
    // Hearing Status & Phase
    status: text("status").default("scheduled").notNull(), // "scheduled", "ai_ready", "in_progress", "paused", "completed", "cancelled"
    phase: text("phase").default("pre_hearing"), // "pre_hearing", "opening_statements", "evidence", "cross_examination", "closing", "deliberation", "completed"
    currentSpeaker: text("current_speaker"), // "judge", "claimant_lawyer", "respondent_lawyer", "claimant", "respondent", "witness"
    
    // AI Agent Configuration
    aiParticipantsConfig: jsonb("ai_participants_config").$type<Record<string, unknown> | null>(),
    agentTurnOrder: jsonb("agent_turn_order").$type<string[] | null>(),
    
    // Real-time Processing
    transcriptionSessionId: text("transcription_session_id"),
    lastTranscriptionAt: timestamp("last_transcription_at", { withTimezone: true }),
    
    // Hearing Control
    isRecording: text("is_recording").default("false").notNull(), // "true", "false"
    isTranscribing: text("is_transcribing").default("true").notNull(), // "true", "false"
    autoTranscribe: text("auto_transcribe").default("true").notNull(), // "true", "false"
    
    // Participants
    judgeId: text("judge_id"), // User ID if human judge, null if AI judge
    claimantLawyerId: text("claimant_lawyer_id"), // User ID if human lawyer, null if AI
    respondentLawyerId: text("respondent_lawyer_id"), // User ID if human lawyer, null if AI
    
    // Notes & Outcomes
    judgeNotes: text("judge_notes"),
    hearingSummary: text("hearing_summary"),
    nextHearingDate: timestamp("next_hearing_date", { withTimezone: true }),
    outcome: text("outcome"), // "continued", "settled", "adjourned", "judgment_reserved"
    
    // Technical Metadata
    technicalNotes: jsonb("technical_notes").$type<Record<string, unknown> | null>(), // Store technical logs, errors, etc.
    
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdIdx: index("hearings_case_id_idx").on(table.caseId),
    statusIdx: index("hearings_status_idx").on(table.status),
    scheduledStartTimeIdx: index("hearings_scheduled_start_time_idx").on(table.scheduledStartTime),
    meetingIdIdx: index("hearings_meeting_id_idx").on(table.meetingId),
  }),
);

// Hearing Transcripts - Store real-time transcription data
export const hearingTranscripts = pgTable(
  "hearing_transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(), // Back to uuid type
    hearingId: uuid("hearing_id").notNull().references(() => hearings.id, { onDelete: "cascade" }), // Use uuid type for foreign key
    
    // Transcript Content
    speaker: text("speaker").notNull(), // "judge", "claimant_lawyer", "respondent_lawyer", "claimant", "respondent", "witness"
    speakerName: text("speaker_name"), // Actual name if human participant
    content: text("content").notNull(),
    
    // Timing
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    sequenceNumber: text("sequence_number").notNull(), // For ordering
    
    // Audio Processing
    audioSegmentStart: text("audio_segment_start"), // MM:SS format
    audioSegmentEnd: text("audio_segment_end"), // MM:SS format
    confidence: text("confidence"), // Transcription confidence score
    
    // AI Processing
    aiProcessed: text("ai_processed").default("false").notNull(), // "true", "false"
    aiAnalysis: jsonb("ai_analysis").$type<Record<string, unknown> | null>(), // AI insights about this segment
    
    createdAt,
  },
  (table) => ({
    hearingIdIdx: index("hearing_transcripts_hearing_id_idx").on(table.hearingId),
    timestampIdx: index("hearing_transcripts_timestamp_idx").on(table.timestamp),
    speakerIdx: index("hearing_transcripts_speaker_idx").on(table.speaker),
  }),
);

// Hearing Participants - Track all participants (human and AI)
export const hearingParticipants = pgTable(
  "hearing_participants",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(), // Back to uuid type
    hearingId: uuid("hearing_id").notNull().references(() => hearings.id, { onDelete: "cascade" }), // Use uuid type for foreign key
    
    // Participant Identity
    userId: text("user_id"), // Null for AI participants
    participantType: text("participant_type").notNull(), // "human", "ai_judge", "ai_lawyer", "ai_witness"
    role: text("role").notNull(), // "judge", "claimant_lawyer", "respondent_lawyer", "claimant", "respondent", "witness", "observer"
    displayName: text("display_name").notNull(),
    
    // AI Configuration (for AI participants)
    aiConfig: jsonb("ai_config").$type<Record<string, unknown> | null>(), // Voice ID, personality, etc.
    voiceId: text("voice_id"), // ElevenLabs voice ID
    personality: text("personality"), // "formal_authoritative", "assertive_experienced", etc.
    
    // Participation Status
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    leftAt: timestamp("left_at", { withTimezone: true }),
    isActive: text("is_active").default("true").notNull(), // "true", "false"
    anamSessionToken: text("anam_session_token"), // Session token from Anam AI system
    meetingParticipantId: text("meeting_participant_id"), // ID from meeting platform
    
    createdAt,
    updatedAt,
  },
  (table) => ({
    hearingIdIdx: index("hearing_participants_hearing_id_idx").on(table.hearingId),
    userIdIdx: index("hearing_participants_user_id_idx").on(table.userId),
    roleIdx: index("hearing_participants_role_idx").on(table.role),
  }),
);

// Import the cases table for the foreign key reference
import { cases } from "./cases";

export const hearingProposals = pgTable(
  "hearing_proposals",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    status: text("status").default("open").notNull(),
    slots: jsonb("slots").$type<string[]>().notNull(),
    availability: jsonb("availability").$type<{
      claimant?: (boolean | null)[];
      respondent?: (boolean | null)[];
    }>().default({}).notNull(),
    selectedSlotIndex: integer("selected_slot_index"),
    votingDeadline: timestamp("voting_deadline", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("hearing_proposals_case_idx").on(table.caseId),
    statusIdx: index("hearing_proposals_status_idx").on(table.status),
  }),
);

export type HearingScriptItem = {
  id: string;
  kind: "narrative" | "issue" | "witness";
  participantRole: "claimant" | "respondent" | "witness";
  issueId?: string | null;
  primaryQuestion: string;
  allowedFollowUpObjective?: string | null;
  relatedEvidenceIds: string[];
  evidenceDisplayInstructions?: string | null;
  resolutionCriteria?: string | null;
  maxFollowUps: number;
};

export const hearingPreparations = pgTable(
  "hearing_preparations",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    status: text("status").default("draft").notNull(),
    caseMapJson: jsonb("case_map_json").$type<Record<string, unknown> | null>(),
    disputedIssuesJson: jsonb("disputed_issues_json").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    evidenceBriefsJson: jsonb("evidence_briefs_json").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    claimantScriptJson: jsonb("claimant_script_json").$type<HearingScriptItem[]>().default([]).notNull(),
    respondentScriptJson: jsonb("respondent_script_json").$type<HearingScriptItem[]>().default([]).notNull(),
    reconciliationMemoJson: jsonb("reconciliation_memo_json").$type<Record<string, unknown> | null>(),
    witnessScriptsJson: jsonb("witness_scripts_json").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    finalFactFindingMemoJson: jsonb("final_fact_finding_memo_json").$type<Record<string, unknown> | null>(),
    generatedByUserId: uuid("generated_by_user_id"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("hearing_preparations_case_idx").on(table.caseId),
    statusIdx: index("hearing_preparations_status_idx").on(table.status),
  }),
);

export const hearingSessions = pgTable(
  "hearing_sessions",
  {
    id,
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    preparationId: uuid("preparation_id").notNull().references(() => hearingPreparations.id, { onDelete: "cascade" }),
    participantRole: text("participant_role").notNull(),
    participantName: text("participant_name"),
    witnessId: uuid("witness_id"),
    status: text("status").default("not_started").notNull(),
    scriptJson: jsonb("script_json").$type<HearingScriptItem[]>().default([]).notNull(),
    currentScriptItemId: text("current_script_item_id"),
    completedScriptItemIds: jsonb("completed_script_item_ids").$type<string[]>().default([]).notNull(),
    followUpCountsJson: jsonb("follow_up_counts_json").$type<Record<string, number>>().default({}).notNull(),
    transcriptSummaryJson: jsonb("transcript_summary_json").$type<Record<string, unknown> | null>(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdx: index("hearing_sessions_case_idx").on(table.caseId),
    preparationIdx: index("hearing_sessions_preparation_idx").on(table.preparationId),
    statusIdx: index("hearing_sessions_status_idx").on(table.status),
    participantRoleIdx: index("hearing_sessions_participant_role_idx").on(table.participantRole),
  }),
);

export const hearingMessages = pgTable(
  "hearing_messages",
  {
    id,
    sessionId: uuid("session_id").notNull().references(() => hearingSessions.id, { onDelete: "cascade" }),
    caseId: uuid("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
    senderRole: text("sender_role").notNull(),
    content: text("content").notNull(),
    scriptItemId: text("script_item_id"),
    referencedEvidenceIds: jsonb("referenced_evidence_ids").$type<string[]>().default([]).notNull(),
    messageType: text("message_type").default("statement").notNull(),
    aiAnalysisJson: jsonb("ai_analysis_json").$type<Record<string, unknown> | null>(),
    createdAt,
  },
  (table) => ({
    sessionIdx: index("hearing_messages_session_idx").on(table.sessionId),
    caseIdx: index("hearing_messages_case_idx").on(table.caseId),
    scriptItemIdx: index("hearing_messages_script_item_idx").on(table.scriptItemId),
  }),
);
