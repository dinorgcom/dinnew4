import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    notificationPref: text("notification_pref").default("all").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => ({
    clerkUserIdIdx: uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
  }),
);

// Personal access tokens for the API. Plain token format is
// `din_pat_<32 hex>`. Only the SHA-256 hash is stored; the prefix
// (first 12 chars of the plain token) is kept separately for UI display
// so users can identify a token in the list without having access to
// the secret.
export const serviceTokens = pgTable(
  "service_tokens",
  {
    id,
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdx: index("service_tokens_user_idx").on(table.userId),
    hashIdx: uniqueIndex("service_tokens_hash_idx").on(table.tokenHash),
  }),
);
