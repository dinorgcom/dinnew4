import { z } from "zod";

export const caseStatusSchema = z.enum([
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

export const partySideSchema = z.enum(["claimant", "respondent", "arbitrator"]);

export const discussionEntrySchema = z.object({
  comment: z.string(),
  submittedBy: z.string(),
  submittedAt: z.string(),
});

export const claimResponseSchema = z.object({
  response: z.string(),
  submittedBy: z.string(),
  submittedDate: z.string(),
});

export const claimSchema = z.object({
  claim: z.string(),
  details: z.string().optional(),
  evidenceIds: z.array(z.string()).default([]),
  witnessIds: z.array(z.string()).default([]),
  responses: z.array(claimResponseSchema).default([]),
});
