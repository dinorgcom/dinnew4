import { pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { accountStatusEnum, appRoleEnum } from "./enums";
import { createdAt, id, updatedAt } from "./common";
import { kycVerifications } from "./kyc";

export const users = pgTable(
  "users",
  {
    id,
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    fullName: text("full_name"),
    role: appRoleEnum("role").default("user").notNull(),
    accountStatus: accountStatusEnum("account_status").default("active").notNull(),
    suspensionReason: text("suspension_reason"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedByUserId: text("suspended_by_user_id"),
    kycVerificationId: uuid("kyc_verification_id").references(() => kycVerifications.id, { onDelete: "set null" }),
    metadataJson: text("metadata_json"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    clerkUserIdIdx: uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);
