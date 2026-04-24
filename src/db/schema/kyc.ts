import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { kycStatusEnum } from "./enums";
import { createdAt, id, updatedAt } from "./common";

export const kycVerifications = pgTable(
  "kyc_verifications",
  {
    id,
    stripeSessionId: text("stripe_session_id").notNull(),
    status: kycStatusEnum("status").default("pending").notNull(),
    // Stripe verified_outputs (source of truth)
    verifiedFirstName: text("verified_first_name"),
    verifiedLastName: text("verified_last_name"),
    verifiedDobDay: integer("verified_dob_day"),
    verifiedDobMonth: integer("verified_dob_month"),
    verifiedDobYear: integer("verified_dob_year"),
    verifiedAddressLine1: text("verified_address_line1"),
    verifiedAddressLine2: text("verified_address_line2"),
    verifiedAddressCity: text("verified_address_city"),
    verifiedAddressState: text("verified_address_state"),
    verifiedAddressPostalCode: text("verified_address_postal_code"),
    verifiedAddressCountry: text("verified_address_country"),
    verifiedIdNumber: text("verified_id_number"),
    verifiedIdNumberType: text("verified_id_number_type"),
    // Full JSON for future-proofing
    verifiedOutputsJson: jsonb("verified_outputs_json").$type<Record<string, unknown> | null>(),
    // Error tracking
    lastErrorCode: text("last_error_code"),
    lastErrorReason: text("last_error_reason"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    stripeSessionIdx: uniqueIndex("kyc_verifications_stripe_session_idx").on(table.stripeSessionId),
  }),
);
