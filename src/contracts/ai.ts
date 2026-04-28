import { z } from "zod";

export const auditRequestSchema = z.object({
  side: z.enum(["claimant", "respondent"]).default("claimant"),
  title: z.string().trim().min(3).max(120).optional(),
});

export const arbitrationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    settlementOfferUsd: z.number().nullable().optional(),
    settlementProposalText: z.string().trim().max(4000).nullable().optional(),
  }),
  z.object({
    action: z.literal("accept"),
    arbitrationClaimantResponse: z.enum(["accepted", "rejected"]).optional(),
    arbitrationRespondentResponse: z.enum(["accepted", "rejected"]).optional(),
    settlementOfferUsd: z.number().nullable().optional(),
    settlementProposalText: z.string().trim().max(4000).nullable().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    note: z.string().trim().max(500).optional(),
    arbitrationClaimantResponse: z.enum(["accepted", "rejected"]).optional(),
    arbitrationRespondentResponse: z.enum(["accepted", "rejected"]).optional(),
    settlementOfferUsd: z.number().nullable().optional(),
    settlementProposalText: z.string().trim().max(4000).nullable().optional(),
  }),
]);

export const judgementActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
    clearSimulationData: z.boolean().optional(),
    clearDataImmediately: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("accept"),
  }),
]);

export const lawyerChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  personality: z.enum(["strategic", "concise", "assertive"]).default("strategic"),
});
