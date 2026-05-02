import { and, eq, gt, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  caseParties,
  cases,
  consultants,
  deadlineRemindersSent,
  evidence,
  lawyers,
  witnesses,
} from "@/db/schema";
import { env } from "@/lib/env";
import { notifyCaseEvent } from "@/server/notifications/service";

// Vercel Cron runs this once per day. The cron walks every entity with an
// open deadline (< 3 days away or < 24 hours away) and sends a reminder
// email if one hasn't already been sent for that (entity, threshold).
//
// We dedupe per (entity_type, entity_id, threshold) via the
// deadline_reminders_sent table so the cron is idempotent.

type Threshold = "3d" | "24h";

const THRESHOLDS: Array<{ key: Threshold; minMs: number; maxMs: number; label: string }> = [
  // 3-day reminder fires when 24h < remaining <= 3d.
  { key: "3d", minMs: 24 * 60 * 60 * 1000, maxMs: 3 * 24 * 60 * 60 * 1000, label: "in 3 days" },
  // 24-hour reminder fires when 0 < remaining <= 24h.
  { key: "24h", minMs: 0, maxMs: 24 * 60 * 60 * 1000, label: "in 24 hours" },
];

type ReminderTarget = {
  caseId: string;
  entityType: string;
  entityId: string;
  title: string;
  deadlineAt: Date;
};

async function loadOpenDeadlines(now: Date): Promise<ReminderTarget[]> {
  const db = getDb();
  const horizon = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

  const targets: ReminderTarget[] = [];

  // Evidence review windows.
  const evidenceRows = await db
    .select({
      id: evidence.id,
      caseId: evidence.caseId,
      title: evidence.title,
      deadline: evidence.discussionDeadline,
      reviewState: evidence.reviewState,
    })
    .from(evidence)
    .where(
      and(
        isNotNull(evidence.discussionDeadline),
        gt(evidence.discussionDeadline, now),
        lte(evidence.discussionDeadline, horizon),
      ),
    );
  for (const row of evidenceRows) {
    if ((row.reviewState ?? "pending") !== "pending") continue;
    targets.push({
      caseId: row.caseId,
      entityType: "evidence",
      entityId: row.id,
      title: `Evidence review: ${row.title}`,
      deadlineAt: row.deadline!,
    });
  }

  // Witness review windows.
  const witnessRows = await db
    .select({
      id: witnesses.id,
      caseId: witnesses.caseId,
      fullName: witnesses.fullName,
      deadline: witnesses.discussionDeadline,
      reviewState: witnesses.reviewState,
    })
    .from(witnesses)
    .where(
      and(
        isNotNull(witnesses.discussionDeadline),
        gt(witnesses.discussionDeadline, now),
        lte(witnesses.discussionDeadline, horizon),
      ),
    );
  for (const row of witnessRows) {
    if ((row.reviewState ?? "pending") !== "pending") continue;
    targets.push({
      caseId: row.caseId,
      entityType: "witness",
      entityId: row.id,
      title: `Witness review: ${row.fullName}`,
      deadlineAt: row.deadline!,
    });
  }

  // Consultant review windows.
  const consultantRows = await db
    .select({
      id: consultants.id,
      caseId: consultants.caseId,
      fullName: consultants.fullName,
      deadline: consultants.discussionDeadline,
      reviewState: consultants.reviewState,
    })
    .from(consultants)
    .where(
      and(
        isNotNull(consultants.discussionDeadline),
        gt(consultants.discussionDeadline, now),
        lte(consultants.discussionDeadline, horizon),
      ),
    );
  for (const row of consultantRows) {
    if ((row.reviewState ?? "pending") !== "pending") continue;
    targets.push({
      caseId: row.caseId,
      entityType: "consultant",
      entityId: row.id,
      title: `Consultant review: ${row.fullName}`,
      deadlineAt: row.deadline!,
    });
  }

  // Lawyer review windows.
  const lawyerRows = await db
    .select({
      id: lawyers.id,
      caseId: lawyers.caseId,
      fullName: lawyers.fullName,
      deadline: lawyers.discussionDeadline,
      reviewState: lawyers.reviewState,
    })
    .from(lawyers)
    .where(
      and(
        isNotNull(lawyers.discussionDeadline),
        gt(lawyers.discussionDeadline, now),
        lte(lawyers.discussionDeadline, horizon),
      ),
    );
  for (const row of lawyerRows) {
    if ((row.reviewState ?? "pending") !== "pending") continue;
    targets.push({
      caseId: row.caseId,
      entityType: "lawyer",
      entityId: row.id,
      title: `Lawyer review: ${row.fullName}`,
      deadlineAt: row.deadline!,
    });
  }

  // Multi-party approval deadlines.
  const partyRows = await db
    .select({
      id: caseParties.id,
      caseId: caseParties.caseId,
      fullName: caseParties.fullName,
      side: caseParties.side,
      deadline: caseParties.approvalDeadline,
      status: caseParties.status,
    })
    .from(caseParties)
    .where(
      and(
        eq(caseParties.status, "pending_approval"),
        isNotNull(caseParties.approvalDeadline),
        gt(caseParties.approvalDeadline, now),
        lte(caseParties.approvalDeadline, horizon),
      ),
    );
  for (const row of partyRows) {
    targets.push({
      caseId: row.caseId,
      entityType: "party_approval",
      entityId: row.id,
      title: `Approve additional ${row.side}: ${row.fullName}`,
      deadlineAt: row.deadline!,
    });
  }

  return targets;
}

export async function GET(request: Request) {
  // Auth: Vercel automatically attaches an Authorization header equal to
  // `Bearer ${CRON_SECRET}` for cron-triggered requests. Reject calls that
  // don't carry the secret. If CRON_SECRET isn't set, the route is open
  // (useful for local development) — set it in production.
  if (env.CRON_SECRET) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb();
  const now = new Date();
  const targets = await loadOpenDeadlines(now);

  const results: Array<{
    entityType: string;
    entityId: string;
    threshold: Threshold;
    sent: boolean;
    skipped?: string;
  }> = [];

  for (const target of targets) {
    const remainingMs = target.deadlineAt.getTime() - now.getTime();
    for (const t of THRESHOLDS) {
      if (remainingMs <= t.minMs || remainingMs > t.maxMs) continue;

      // Try to claim the (entity, threshold) slot. A unique index on
      // (entity_type, entity_id, threshold) prevents double-sends when
      // the cron runs multiple times in the same window.
      try {
        await db.insert(deadlineRemindersSent).values({
          caseId: target.caseId,
          entityType: target.entityType,
          entityId: target.entityId,
          threshold: t.key,
          deadlineAt: target.deadlineAt,
        });
      } catch (err) {
        // Unique violation — already sent.
        results.push({
          entityType: target.entityType,
          entityId: target.entityId,
          threshold: t.key,
          sent: false,
          skipped: "already_sent",
        });
        continue;
      }

      try {
        await notifyCaseEvent(target.caseId, "deadline_reminder", {
          title: target.title,
          body: `Deadline ${t.label} (${target.deadlineAt.toUTCString()}).`,
        });
        results.push({
          entityType: target.entityType,
          entityId: target.entityId,
          threshold: t.key,
          sent: true,
        });
      } catch (err) {
        results.push({
          entityType: target.entityType,
          entityId: target.entityId,
          threshold: t.key,
          sent: false,
          skipped: err instanceof Error ? err.message : "send_failed",
        });
      }
    }
  }

  return Response.json({
    ok: true,
    runAt: now.toISOString(),
    candidateCount: targets.length,
    results,
  });
}
