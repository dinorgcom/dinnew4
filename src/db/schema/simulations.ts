import { index, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";

export const simulations = pgTable(
  "simulations",
  {
    id,
    caseId: text("case_id").notNull(),
    // Simulation session data
    sessionId: text("session_id").notNull(),
    shareToken: text("share_token"),
    outcomeType: text("outcome_type"),
    stoppingReason: text("stopping_reason"),
    rounds: numeric("rounds", { precision: 3, scale: 0 }),
    tokensUsed: numeric("tokens_used", { precision: 8, scale: 0 }),
    // Large JSON fields
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    timeline: jsonb("timeline").$type<Record<string, unknown> | null>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    caseIdIdx: index("simulations_case_id_idx").on(table.caseId),
    sessionIdIdx: index("simulations_session_id_idx").on(table.sessionId),
    completedAtIdx: index("simulations_completed_at_idx").on(table.completedAt),
  }),
);
