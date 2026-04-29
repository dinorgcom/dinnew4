import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  cases,
  evidence,
  expertiseRequests,
  hearingProposals,
  hearings,
  witnesses,
} from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/mutations";

type AppUser = ProvisionedAppUser | null;

const SLOT_COUNT = 5;
const DISCOVERY_INACTIVITY_DAYS = 14;
const VOTING_WINDOW_DAYS = 7;

export type DiscoveryStatus = {
  complete: boolean;
  // Discovery completion source: which gate(s) closed it
  reason: "tasks-settled" | "both-parties-ready" | "inactivity" | "incomplete";
  pendingEvidence: number;
  pendingWitnesses: number;
  pendingExpertise: number;
  // Per-party readiness flags
  claimantReadyAt: string | null;
  respondentReadyAt: string | null;
  // The point in time at which the inactivity countdown will trip discovery
  // closed if no further activity happens. Computed against last_activity_at
  // (or case createdAt as a fallback). Null when reviewable items are still
  // pending — the inactivity countdown only matters once tasks are settled.
  inactivityCloseAt: string | null;
};

export async function isDiscoveryComplete(caseId: string): Promise<DiscoveryStatus> {
  const db = getDb();
  const [caseRows, evidenceRows, witnessRows, expertiseRows] = await Promise.all([
    db
      .select({
        createdAt: cases.createdAt,
        lastActivityAt: cases.lastActivityAt,
        claimantReadyAt: cases.discoveryReadyClaimantAt,
        respondentReadyAt: cases.discoveryReadyRespondentAt,
      })
      .from(cases)
      .where(eq(cases.id, caseId))
      .limit(1),
    db.select({ id: evidence.id, reviewState: evidence.reviewState, status: evidence.status, deadline: evidence.discussionDeadline }).from(evidence).where(eq(evidence.caseId, caseId)),
    db.select({ id: witnesses.id, status: witnesses.status }).from(witnesses).where(eq(witnesses.caseId, caseId)),
    db.select({ id: expertiseRequests.id, status: expertiseRequests.status }).from(expertiseRequests).where(eq(expertiseRequests.caseId, caseId)),
  ]);

  const caseRow = caseRows[0];
  const now = new Date();
  const pendingEvidence = evidenceRows.filter((row) => {
    const stored = (row.reviewState || "pending").toLowerCase();
    if (stored !== "pending") return false;
    if (row.deadline && now > new Date(row.deadline)) return false;
    return true;
  }).length;
  const pendingWitnesses = witnessRows.filter((row) => row.status === "pending").length;
  const pendingExpertise = expertiseRows.filter((row) => row.status === "draft" || row.status === "generating").length;
  const tasksSettled = pendingEvidence === 0 && pendingWitnesses === 0 && pendingExpertise === 0;

  const claimantReadyAt = caseRow?.claimantReadyAt ?? null;
  const respondentReadyAt = caseRow?.respondentReadyAt ?? null;
  const bothPartiesReady = !!claimantReadyAt && !!respondentReadyAt;

  // Inactivity gate: if tasks are settled and there's been no activity for
  // 14 days, treat discovery as auto-closed. Use last_activity_at if known,
  // else fall back to case createdAt.
  const lastActivityIso = caseRow?.lastActivityAt
    ? new Date(caseRow.lastActivityAt).toISOString()
    : caseRow?.createdAt
      ? new Date(caseRow.createdAt).toISOString()
      : null;
  const inactivityCloseAt =
    tasksSettled && lastActivityIso
      ? new Date(
          new Date(lastActivityIso).getTime() + DISCOVERY_INACTIVITY_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;
  const inactivityElapsed =
    inactivityCloseAt !== null && now > new Date(inactivityCloseAt);

  let reason: DiscoveryStatus["reason"] = "incomplete";
  let complete = false;
  if (tasksSettled && bothPartiesReady) {
    complete = true;
    reason = "both-parties-ready";
  } else if (tasksSettled && inactivityElapsed) {
    complete = true;
    reason = "inactivity";
  } else if (tasksSettled) {
    // Tasks are done but neither auto-close has tripped. We still surface
    // this as "incomplete" so the UI shows the ready prompt + inactivity
    // countdown.
    reason = "incomplete";
  }

  return {
    complete,
    reason,
    pendingEvidence,
    pendingWitnesses,
    pendingExpertise,
    claimantReadyAt: claimantReadyAt ? new Date(claimantReadyAt).toISOString() : null,
    respondentReadyAt: respondentReadyAt ? new Date(respondentReadyAt).toISOString() : null,
    inactivityCloseAt,
  };
}

export async function markDiscoveryReady(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only case parties can mark discovery ready");
  }

  const db = getDb();
  const now = new Date();
  const update: Partial<typeof cases.$inferInsert> = {
    lastActivityAt: now,
    updatedAt: now,
  };
  if (authorized.role === "claimant") {
    update.discoveryReadyClaimantAt = now;
  } else {
    update.discoveryReadyRespondentAt = now;
  }
  const updated = await db
    .update(cases)
    .set(update)
    .where(eq(cases.id, caseId))
    .returning();

  // If both parties are now ready, kick off the slot proposal automatically
  // so the second party doesn't have to click "Generate" afterwards.
  const generated = await tryAutoGenerateProposal(user, caseId);

  return { case: updated[0], role: authorized.role, generatedProposal: generated };
}

export async function getActiveHearingProposal(caseId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(hearingProposals)
    .where(eq(hearingProposals.caseId, caseId))
    .orderBy(desc(hearingProposals.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

function isFutureWeekdayBusinessHourUTC(value: Date) {
  if (Number.isNaN(value.getTime())) return false;
  if (value.getTime() < Date.now() + 24 * 60 * 60 * 1000) return false;
  const day = value.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = value.getUTCHours();
  return hour >= 9 && hour <= 17;
}

// Deterministic slot picker: starting 7 days out, walks forward day by day,
// keeps the next SLOT_COUNT weekdays at 14:00 UTC. Always returns valid
// slots — no AI variability, no "AI returned invalid slots" errors.
function pickProceduralSlots(): string[] {
  const out: string[] = [];
  const start = new Date();
  start.setUTCHours(14, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() + 7);
  let cursor = new Date(start);
  // Hard cap on iterations (~21 days) to avoid runaway loops.
  for (let i = 0; out.length < SLOT_COUNT && i < 21; i += 1) {
    if (isFutureWeekdayBusinessHourUTC(cursor)) {
      out.push(cursor.toISOString());
    }
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export async function generateHearingProposal(user: AppUser, caseId: string) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent" && authorized.role !== "moderator") {
    throw new Error("Only case parties or moderators can generate proposals");
  }

  // Moderators (DIN.ORG-side mediators and admins viewing as moderators)
  // can force-generate even if the parties haven't finished discovery —
  // useful for testing and for nudging stalled cases forward. Parties
  // still need a clean discovery state.
  if (authorized.role !== "moderator") {
    const discovery = await isDiscoveryComplete(caseId);
    if (!discovery.complete) {
      throw new Error("Discovery is not yet complete.");
    }
  }

  const db = getDb();
  const caseRow = (await db.select().from(cases).where(eq(cases.id, caseId)).limit(1))[0];
  if (!caseRow) throw new Error("Case not found");

  const slots = pickProceduralSlots();
  if (slots.length < SLOT_COUNT) {
    throw new Error("Could not generate slots. Please retry.");
  }

  // Replace any prior open proposals.
  await db
    .update(hearingProposals)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(hearingProposals.caseId, caseId), eq(hearingProposals.status, "open")));

  const votingDeadline = new Date(Date.now() + VOTING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(hearingProposals)
    .values({
      caseId,
      slots: slots.slice(0, SLOT_COUNT),
      availability: { claimant: [], respondent: [] },
      status: "open",
      votingDeadline,
    })
    .returning();
  return inserted[0];
}

async function tryAutoGenerateProposal(user: AppUser, caseId: string) {
  // Called after a party marks ready. If discovery is now complete and there
  // is no open proposal yet, generate one immediately so the slot voting UI
  // shows up without an extra click.
  try {
    const status = await isDiscoveryComplete(caseId);
    if (!status.complete) return null;
    const existing = await getActiveHearingProposal(caseId);
    if (existing && existing.status === "open") return null;
    return await generateHearingProposal(user, caseId);
  } catch {
    return null;
  }
}

export async function autoFinalizeHearingProposalIfDue(caseId: string) {
  const db = getDb();
  const proposal = await getActiveHearingProposal(caseId);
  if (!proposal || proposal.status !== "open") return null;
  if (!proposal.votingDeadline) return null;

  const deadlineIso =
    typeof proposal.votingDeadline === "string"
      ? new Date(proposal.votingDeadline)
      : proposal.votingDeadline;
  if (new Date() < deadlineIso) return null;

  const tally = tallyAvailability(proposal);
  // Pick the slot with the most yes votes; tiebreak by earliest slot.
  const sorted = [...tally].sort((a, b) => {
    if (b.yesCount !== a.yesCount) return b.yesCount - a.yesCount;
    const slotA = new Date(proposal.slots?.[a.index] || 0).getTime();
    const slotB = new Date(proposal.slots?.[b.index] || 0).getTime();
    return slotA - slotB;
  });
  const winner = sorted[0];
  if (!winner || winner.yesCount === 0) {
    // No one voted yes on anything — leave the proposal open for moderator
    // intervention rather than confirming an empty slot.
    return null;
  }

  const slotIso = proposal.slots?.[winner.index];
  if (!slotIso) return null;
  const start = new Date(slotIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const inserted = await db
    .insert(hearings)
    .values({
      caseId,
      scheduledStartTime: start,
      scheduledEndTime: end,
      status: "scheduled",
      meetingPlatform: "anam",
    })
    .returning();

  await db
    .update(hearingProposals)
    .set({ status: "confirmed", selectedSlotIndex: winner.index, updatedAt: new Date() })
    .where(eq(hearingProposals.id, proposal.id));

  await db
    .update(cases)
    .set({ status: "hearing_scheduled", lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(cases.id, caseId));

  return { hearing: inserted[0], proposalId: proposal.id, slotIndex: winner.index };
}

const voteSchema = z.object({
  proposalId: z.string().uuid(),
  slotIndex: z.number().int().min(0).max(SLOT_COUNT - 1),
  available: z.boolean(),
});

export async function voteAvailability(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent") {
    throw new Error("Only the case parties can vote");
  }
  const role = authorized.role;
  const parsed = voteSchema.parse(payload);
  const db = getDb();

  const rows = await db
    .select()
    .from(hearingProposals)
    .where(and(eq(hearingProposals.id, parsed.proposalId), eq(hearingProposals.caseId, caseId)))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "open") throw new Error("Proposal is closed");

  const availability = (proposal.availability || {}) as {
    claimant?: (boolean | null)[];
    respondent?: (boolean | null)[];
  };
  const partyKey = role as "claimant" | "respondent";
  const arr = (availability[partyKey] ?? []).slice();
  while (arr.length < SLOT_COUNT) arr.push(null);
  arr[parsed.slotIndex] = parsed.available;
  availability[partyKey] = arr;

  const updated = await db
    .update(hearingProposals)
    .set({ availability, updatedAt: new Date() })
    .where(eq(hearingProposals.id, parsed.proposalId))
    .returning();
  return updated[0];
}

const confirmSchema = z.object({
  proposalId: z.string().uuid(),
  slotIndex: z.number().int().min(0).max(SLOT_COUNT - 1),
});

export async function confirmHearingSlot(user: AppUser, caseId: string, payload: unknown) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent" && authorized.role !== "moderator") {
    throw new Error("Only case parties or moderators can confirm a slot");
  }
  const parsed = confirmSchema.parse(payload);
  const db = getDb();

  const rows = await db
    .select()
    .from(hearingProposals)
    .where(and(eq(hearingProposals.id, parsed.proposalId), eq(hearingProposals.caseId, caseId)))
    .limit(1);
  const proposal = rows[0];
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "open") throw new Error("Proposal is closed");

  const slotIso = proposal.slots?.[parsed.slotIndex];
  if (!slotIso) throw new Error("Invalid slot");
  const start = new Date(slotIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const inserted = await db
    .insert(hearings)
    .values({
      caseId,
      scheduledStartTime: start,
      scheduledEndTime: end,
      status: "scheduled",
      meetingPlatform: "anam",
    })
    .returning();

  await db
    .update(hearingProposals)
    .set({ status: "confirmed", selectedSlotIndex: parsed.slotIndex, updatedAt: new Date() })
    .where(eq(hearingProposals.id, parsed.proposalId));

  await db
    .update(cases)
    .set({ status: "hearing_scheduled", updatedAt: new Date() })
    .where(eq(cases.id, caseId));

  return { hearing: inserted[0], proposalId: parsed.proposalId, slotIndex: parsed.slotIndex };
}

export function tallyAvailability(proposal: typeof hearingProposals.$inferSelect) {
  const a = (proposal.availability || {}) as {
    claimant?: (boolean | null)[];
    respondent?: (boolean | null)[];
  };
  return Array.from({ length: SLOT_COUNT }).map((_, index) => {
    const claimant = a.claimant?.[index] ?? null;
    const respondent = a.respondent?.[index] ?? null;
    const yesCount = (claimant === true ? 1 : 0) + (respondent === true ? 1 : 0);
    return {
      index,
      claimant,
      respondent,
      yesCount,
      bothYes: claimant === true && respondent === true,
    };
  });
}
