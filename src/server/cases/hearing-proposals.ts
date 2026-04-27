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
import { generateStructuredObject, isAiConfigured } from "@/server/ai/service";

type AppUser = ProvisionedAppUser | null;

const SLOT_COUNT = 5;

export type DiscoveryStatus = {
  complete: boolean;
  pendingEvidence: number;
  pendingWitnesses: number;
  pendingExpertise: number;
};

export async function isDiscoveryComplete(caseId: string): Promise<DiscoveryStatus> {
  const db = getDb();
  const [evidenceRows, witnessRows, expertiseRows] = await Promise.all([
    db.select({ id: evidence.id, reviewState: evidence.reviewState, status: evidence.status, deadline: evidence.discussionDeadline }).from(evidence).where(eq(evidence.caseId, caseId)),
    db.select({ id: witnesses.id, status: witnesses.status }).from(witnesses).where(eq(witnesses.caseId, caseId)),
    db.select({ id: expertiseRequests.id, status: expertiseRequests.status }).from(expertiseRequests).where(eq(expertiseRequests.caseId, caseId)),
  ]);

  const now = new Date();
  const pendingEvidence = evidenceRows.filter((row) => {
    const stored = (row.reviewState || "pending").toLowerCase();
    if (stored !== "pending") return false;
    if (row.deadline && now > new Date(row.deadline)) return false;
    return true;
  }).length;
  const pendingWitnesses = witnessRows.filter((row) => row.status === "pending").length;
  const pendingExpertise = expertiseRows.filter((row) => row.status === "draft" || row.status === "generating").length;

  return {
    complete: pendingEvidence === 0 && pendingWitnesses === 0 && pendingExpertise === 0,
    pendingEvidence,
    pendingWitnesses,
    pendingExpertise,
  };
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

const aiSchema = z.object({
  slots: z.array(z.string()).length(SLOT_COUNT),
});

function isFutureWeekdayBusinessHourUTC(value: Date) {
  if (Number.isNaN(value.getTime())) return false;
  if (value.getTime() < Date.now() + 24 * 60 * 60 * 1000) return false;
  const day = value.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = value.getUTCHours();
  return hour >= 9 && hour <= 17;
}

export async function generateHearingProposal(user: AppUser, caseId: string) {
  if (!isAiConfigured()) {
    throw new Error("AI is not configured.");
  }
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) throw new Error("Forbidden");
  if (authorized.role !== "claimant" && authorized.role !== "respondent" && authorized.role !== "moderator") {
    throw new Error("Only case parties or moderators can generate proposals");
  }

  const discovery = await isDiscoveryComplete(caseId);
  if (!discovery.complete) {
    throw new Error("Discovery is not yet complete.");
  }

  const db = getDb();
  const caseRow = (await db.select().from(cases).where(eq(cases.id, caseId)).limit(1))[0];
  if (!caseRow) throw new Error("Case not found");

  const startWindow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const endWindow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const prompt = [
    `You are scheduling a video hearing for an arbitration case on the DIN.ORG platform.`,
    `Suggest exactly ${SLOT_COUNT} candidate hearing time slots, each on a different weekday between ${startWindow} and ${endWindow} (UTC).`,
    `Each slot must be 9:00-17:00 UTC, a 60-minute meeting (use the start time only), at least 24 hours in the future, and on a weekday.`,
    `Spread the slots across different days. Do not repeat dates.`,
    `Output JSON: { "slots": ["ISO-8601 string", ...5 items] }.`,
  ].join("\n");

  const ai = (await generateStructuredObject(prompt, aiSchema)) as z.infer<typeof aiSchema>;
  const validSlots = ai.slots
    .map((s: string) => new Date(s))
    .filter(isFutureWeekdayBusinessHourUTC)
    .map((d: Date) => d.toISOString());

  if (validSlots.length < SLOT_COUNT) {
    throw new Error("AI returned invalid slots. Please retry.");
  }

  // Replace any prior open proposals.
  await db
    .update(hearingProposals)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(hearingProposals.caseId, caseId), eq(hearingProposals.status, "open")));

  const inserted = await db
    .insert(hearingProposals)
    .values({
      caseId,
      slots: validSlots.slice(0, SLOT_COUNT),
      availability: { claimant: [], respondent: [] },
      status: "open",
    })
    .returning();
  return inserted[0];
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
