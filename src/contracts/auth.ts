import { z } from "zod";

export const appRoleSchema = z.enum(["user", "moderator", "admin"]);
export const caseRoleSchema = z.enum(["claimant", "respondent", "moderator", "admin"]);

export const appSessionSchema = z.object({
  clerkUserId: z.string(),
  appUserId: z.string().uuid().optional(),
  email: z.string().email(),
  role: appRoleSchema.optional(),
});
