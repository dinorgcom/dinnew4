import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cases, witnessQuestions, witnesses } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { getAuthorizedCase } from "@/server/cases/access";
import { generateStructuredObject, isAiConfigured } from "@/server/ai/service";

type AppUser = ProvisionedAppUser | null;

const QUESTION_MIN = 5;
const QUESTION_MAX = 2000;

const createSchema = z.object({
  questionText: z.string().min(QUESTION_MIN).max(QUESTION_MAX),
  source: z.enum(["manual", "ai_suggested"]).optional(),
});

function partyRole(role: string | null | undefined) {
  if (role === "claimant" || role === "respondent") return role;
  return null;
}

export async function listMyWitnessQuestions(
  user: AppUser,
  caseId: string,
  witnessId: string,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const role = partyRole(authorized.role);
  if (!role) {
    return [];
  }
  const db = getDb();
  return db
    .select()
    .from(witnessQuestions)
    .where(
      and(
        eq(witnessQuestions.caseId, caseId),
        eq(witnessQuestions.witnessId, witnessId),
        eq(witnessQuestions.askingPartyRole, role),
      ),
    )
    .orderBy(asc(witnessQuestions.createdAt));
}

export async function createWitnessQuestion(
  user: AppUser,
  caseId: string,
  witnessId: string,
  payload: unknown,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const role = partyRole(authorized.role);
  if (!role) {
    throw new Error("Only claimants or respondents can add questions");
  }
  const parsed = createSchema.parse(payload);
  const db = getDb();

  const witnessRows = await db
    .select()
    .from(witnesses)
    .where(and(eq(witnesses.id, witnessId), eq(witnesses.caseId, caseId)))
    .limit(1);
  if (!witnessRows[0]) {
    throw new Error("Witness not found");
  }

  const inserted = await db
    .insert(witnessQuestions)
    .values({
      caseId,
      witnessId,
      askingPartyRole: role,
      questionText: parsed.questionText.trim(),
      source: parsed.source ?? "manual",
      createdByUserId: user?.id ?? null,
    })
    .returning();

  return inserted[0];
}

export async function deleteWitnessQuestion(
  user: AppUser,
  caseId: string,
  questionId: string,
) {
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const role = partyRole(authorized.role);
  if (!role) {
    throw new Error("Only claimants or respondents can manage questions");
  }
  const db = getDb();
  await db
    .delete(witnessQuestions)
    .where(
      and(
        eq(witnessQuestions.id, questionId),
        eq(witnessQuestions.caseId, caseId),
        eq(witnessQuestions.askingPartyRole, role),
      ),
    );
}

const aiSuggestionSchema = z.object({
  questions: z.array(z.string().min(QUESTION_MIN).max(QUESTION_MAX)).min(3).max(6),
});

export async function suggestWitnessQuestions(
  user: AppUser,
  caseId: string,
  witnessId: string,
) {
  if (!isAiConfigured()) {
    throw new Error("AI suggestions are not available right now.");
  }
  const authorized = await getAuthorizedCase(user, caseId);
  if (!authorized) {
    throw new Error("Forbidden");
  }
  const role = partyRole(authorized.role);
  if (!role) {
    throw new Error("Only claimants or respondents can request suggestions");
  }
  const db = getDb();

  const [caseRows, witnessRows] = await Promise.all([
    db.select().from(cases).where(eq(cases.id, caseId)).limit(1),
    db
      .select()
      .from(witnesses)
      .where(and(eq(witnesses.id, witnessId), eq(witnesses.caseId, caseId)))
      .limit(1),
  ]);
  const caseItem = caseRows[0];
  const witness = witnessRows[0];
  if (!caseItem || !witness) {
    throw new Error("Case or witness not found");
  }

  const prompt = [
    `You are an experienced advocate representing the ${role} in an arbitration case on the DIN.ORG platform.`,
    `Suggest 5 tightly-focused questions that the ${role}'s lawyer should ask the witness during the hearing.`,
    `Each question must be plain text, end with a question mark, be 5-300 characters, and be specific to the case facts below.`,
    "",
    `Case title: ${caseItem.title}`,
    `Case description: ${caseItem.description ?? "(none)"}`,
    `Case category: ${caseItem.category ?? "(unspecified)"}`,
    "",
    `Witness name: ${witness.fullName}`,
    `Witness relationship: ${witness.relationship ?? "(unspecified)"}`,
    `Witness statement: ${witness.statement ?? "(none provided)"}`,
    "",
    `Output JSON with key "questions" containing an array of 5 strings.`,
  ].join("\n");

  const result = await generateStructuredObject(prompt, aiSuggestionSchema);
  return result.questions;
}
