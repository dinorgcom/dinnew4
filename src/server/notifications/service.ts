import { eq, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { getDb } from "@/db/client";
import { cases, consultants, lawyers, users } from "@/db/schema";
import { env } from "@/lib/env";
import { escapeHtml } from "@/server/email/html";

export type CaseEventKey =
  | "evidence_added"
  | "witness_added"
  | "consultant_added"
  | "expertise_added"
  | "lawyer_added"
  | "party_added"
  | "deadline_reminder"
  | "settlement_proposed"
  | "settlement_decided"
  | "judgement_issued"
  | "hearing_scheduled";

// Events that we always send even when the user picked "necessary_only".
// Anything that blocks progress (deadlines), changes outcome (judgements,
// settlements decided), or schedules a real meeting is "necessary".
const NECESSARY_EVENTS = new Set<CaseEventKey>([
  "deadline_reminder",
  "settlement_decided",
  "judgement_issued",
  "hearing_scheduled",
]);

const EVENT_LABEL: Record<CaseEventKey, string> = {
  evidence_added: "New evidence submitted",
  witness_added: "New witness added",
  consultant_added: "New consultant added",
  expertise_added: "New expertise request",
  lawyer_added: "New lawyer added",
  party_added: "Additional party added",
  deadline_reminder: "Deadline reminder",
  settlement_proposed: "Settlement offer proposed",
  settlement_decided: "Settlement offer decided",
  judgement_issued: "Judgement issued",
  hearing_scheduled: "Hearing scheduled",
};

export type NotifyPayload = {
  title?: string;
  body?: string;
  actor?: string;
  url?: string;
};

function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    const v = (value || "").trim().toLowerCase();
    if (v) set.add(v);
  }
  return Array.from(set);
}

async function loadRecipientEmails(caseId: string): Promise<string[]> {
  const db = getDb();
  const [caseRow] = await db
    .select({
      claimantEmail: cases.claimantEmail,
      respondentEmail: cases.respondentEmail,
    })
    .from(cases)
    .where(eq(cases.id, caseId))
    .limit(1);
  const consultantRows = await db
    .select({ email: consultants.email })
    .from(consultants)
    .where(eq(consultants.caseId, caseId));

  const lawyerRows = await db
    .select({ email: lawyers.email })
    .from(lawyers)
    .where(eq(lawyers.caseId, caseId));

  return uniqueEmails([
    caseRow?.claimantEmail,
    caseRow?.respondentEmail,
    ...consultantRows.map((row) => row.email),
    ...lawyerRows.map((row) => row.email),
  ]);
}

async function loadPrefByEmail(emails: string[]) {
  if (emails.length === 0) return new Map<string, "all" | "necessary_only">();
  const db = getDb();
  const rows = await db
    .select({ email: users.email, pref: users.notificationPref })
    .from(users)
    .where(inArray(users.email, emails));
  const map = new Map<string, "all" | "necessary_only">();
  for (const row of rows) {
    const e = row.email.toLowerCase();
    map.set(e, row.pref === "necessary_only" ? "necessary_only" : "all");
  }
  return map;
}

function renderEmailHtml(args: {
  caseTitle: string;
  caseNumber: string;
  caseUrl: string;
  eventLabel: string;
  payload: NotifyPayload;
}) {
  const { caseTitle, caseNumber, caseUrl, eventLabel, payload } = args;
  return [
    `<p>An update on case <strong>${escapeHtml(caseNumber)}</strong> — ${escapeHtml(caseTitle)}.</p>`,
    `<p><strong>${escapeHtml(eventLabel)}</strong>${
      payload.title ? `: ${escapeHtml(payload.title)}` : ""
    }</p>`,
    payload.body ? `<p>${escapeHtml(payload.body)}</p>` : "",
    payload.actor ? `<p><em>By ${escapeHtml(payload.actor)}</em></p>` : "",
    `<p><a href="${escapeHtml(caseUrl)}">Open the case on DIN.ORG</a></p>`,
    `<hr/>`,
    `<p style="font-size:12px;color:#888">You can change which events you get emailed about in your account settings on DIN.ORG.</p>`,
  ].join("\n");
}

export async function notifyCaseEvent(
  caseId: string,
  event: CaseEventKey,
  payload: NotifyPayload = {},
) {
  // Hard fail-soft: any error here must NEVER bubble up to the calling
  // mutation. If email isn't configured we just no-op.
  try {
    if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return;
    const db = getDb();
    const [caseRow] = await db
      .select({ caseNumber: cases.caseNumber, title: cases.title })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1);
    if (!caseRow) return;

    const recipients = await loadRecipientEmails(caseId);
    if (recipients.length === 0) return;
    const prefMap = await loadPrefByEmail(recipients);

    const targets = recipients.filter((email) => {
      // Default for emails not yet linked to a user is "all".
      const pref = prefMap.get(email) ?? "all";
      if (pref === "all") return true;
      return NECESSARY_EVENTS.has(event);
    });
    if (targets.length === 0) return;

    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const caseUrl = `${base}/cases/${caseId}`;
    const subject = `[DIN.ORG] ${EVENT_LABEL[event]} — ${caseRow.caseNumber}`;
    const html = renderEmailHtml({
      caseTitle: caseRow.title,
      caseNumber: caseRow.caseNumber,
      caseUrl,
      eventLabel: EVENT_LABEL[event],
      payload,
    });

    const resend = new Resend(env.RESEND_API_KEY);
    // BCC keeps recipients private from each other and avoids per-message
    // rate limiting from Resend's per-email send loop.
    const primary = targets[0];
    const bcc = targets.slice(1);
    await resend.emails.send({
      from: env.EMAIL_FROM,
      to: [primary],
      bcc: bcc.length > 0 ? bcc : undefined,
      subject,
      html,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("notifyCaseEvent failed", { caseId, event, error });
  }
}
