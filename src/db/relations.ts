import { relations } from "drizzle-orm/relations";
import { cases, caseAudits, users, caseMessages, consultants, evidence, expertiseRequests, lawyers, witnesses, adminUserActions, caseActivities, lawyerConversations, processedStripeEvents, tokenLedger, hearings, hearingParticipants, hearingTranscripts } from "./schema";

export const caseAuditsRelations = relations(caseAudits, ({one}) => ({
	case: one(cases, {
		fields: [caseAudits.caseId],
		references: [cases.id]
	}),
	user: one(users, {
		fields: [caseAudits.requestedByUserId],
		references: [users.id]
	}),
}));

export const casesRelations = relations(cases, ({many}) => ({
	caseAudits: many(caseAudits),
	caseMessages: many(caseMessages),
	consultants: many(consultants),
	evidences: many(evidence),
	expertiseRequests: many(expertiseRequests),
	lawyers: many(lawyers),
	witnesses: many(witnesses),
	caseActivities: many(caseActivities),
	lawyerConversations: many(lawyerConversations),
	tokenLedgers: many(tokenLedger),
	hearings: many(hearings),
}));

export const usersRelations = relations(users, ({many}) => ({
	caseAudits: many(caseAudits),
	adminUserActions_adminUserId: many(adminUserActions, {
		relationName: "adminUserActions_adminUserId_users_id"
	}),
	adminUserActions_targetUserId: many(adminUserActions, {
		relationName: "adminUserActions_targetUserId_users_id"
	}),
	lawyerConversations: many(lawyerConversations),
	processedStripeEvents: many(processedStripeEvents),
	tokenLedgers: many(tokenLedger),
}));

export const caseMessagesRelations = relations(caseMessages, ({one}) => ({
	case: one(cases, {
		fields: [caseMessages.caseId],
		references: [cases.id]
	}),
}));

export const consultantsRelations = relations(consultants, ({one}) => ({
	case: one(cases, {
		fields: [consultants.caseId],
		references: [cases.id]
	}),
}));

export const evidenceRelations = relations(evidence, ({one}) => ({
	case: one(cases, {
		fields: [evidence.caseId],
		references: [cases.id]
	}),
}));

export const expertiseRequestsRelations = relations(expertiseRequests, ({one}) => ({
	case: one(cases, {
		fields: [expertiseRequests.caseId],
		references: [cases.id]
	}),
}));

export const witnessesRelations = relations(witnesses, ({one}) => ({
	case: one(cases, {
		fields: [witnesses.caseId],
		references: [cases.id]
	}),
}));

export const lawyersRelations = relations(lawyers, ({one}) => ({
	case: one(cases, {
		fields: [lawyers.caseId],
		references: [cases.id]
	}),
}));

export const adminUserActionsRelations = relations(adminUserActions, ({one}) => ({
	user_adminUserId: one(users, {
		fields: [adminUserActions.adminUserId],
		references: [users.id],
		relationName: "adminUserActions_adminUserId_users_id"
	}),
	user_targetUserId: one(users, {
		fields: [adminUserActions.targetUserId],
		references: [users.id],
		relationName: "adminUserActions_targetUserId_users_id"
	}),
}));

export const caseActivitiesRelations = relations(caseActivities, ({one}) => ({
	case: one(cases, {
		fields: [caseActivities.caseId],
		references: [cases.id]
	}),
}));

export const lawyerConversationsRelations = relations(lawyerConversations, ({one}) => ({
	case: one(cases, {
		fields: [lawyerConversations.caseId],
		references: [cases.id]
	}),
	user: one(users, {
		fields: [lawyerConversations.userId],
		references: [users.id]
	}),
}));

export const processedStripeEventsRelations = relations(processedStripeEvents, ({one}) => ({
	user: one(users, {
		fields: [processedStripeEvents.userId],
		references: [users.id]
	}),
}));

export const tokenLedgerRelations = relations(tokenLedger, ({one}) => ({
	user: one(users, {
		fields: [tokenLedger.userId],
		references: [users.id]
	}),
	case: one(cases, {
		fields: [tokenLedger.caseId],
		references: [cases.id]
	}),
}));

export const hearingsRelations = relations(hearings, ({one, many}) => ({
	case: one(cases, {
		fields: [hearings.caseId],
		references: [cases.id]
	}),
	hearingParticipants: many(hearingParticipants),
	hearingTranscripts: many(hearingTranscripts),
}));

export const hearingParticipantsRelations = relations(hearingParticipants, ({one}) => ({
	hearing: one(hearings, {
		fields: [hearingParticipants.hearingId],
		references: [hearings.id]
	}),
}));

export const hearingTranscriptsRelations = relations(hearingTranscripts, ({one}) => ({
	hearing: one(hearings, {
		fields: [hearingTranscripts.hearingId],
		references: [hearings.id]
	}),
}));