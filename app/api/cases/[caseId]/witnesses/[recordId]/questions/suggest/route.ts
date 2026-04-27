import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { suggestWitnessQuestions } from "@/server/cases/witness-questions";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const questions = await suggestWitnessQuestions(user, caseId, recordId);
    return ok({ questions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to suggest questions";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("WITNESS_QUESTIONS_SUGGEST_FAILED", message, status);
  }
}
