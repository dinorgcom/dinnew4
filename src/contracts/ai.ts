import { z } from "zod";

export const auditRequestSchema = z.object({
  side: z.enum(["claimant", "respondent"]).default("claimant"),
  title: z.string().trim().min(3).max(120).optional(),
});

export const arbitrationActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
  }),
  z.object({
    action: z.literal("accept"),
  }),
  z.object({
    action: z.literal("reject"),
    note: z.string().trim().min(3).max(500).optional(),
  }),
]);

export const judgementActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("generate"),
  }),
  z.object({
    action: z.literal("accept"),
  }),
]);

export const lawyerChatMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  personality: z.enum(["strategic", "concise", "assertive"]).default("strategic"),
});
