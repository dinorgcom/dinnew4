import { z } from "zod";

export const adminUserUpdateSchema = z.object({
  role: z.enum(["user", "moderator", "admin"]),
  accountStatus: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(3).max(500),
});
