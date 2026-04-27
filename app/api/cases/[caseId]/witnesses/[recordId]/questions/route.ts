import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  createWitnessQuestion,
  listMyWitnessQuestions,
} from "@/server/cases/witness-questions";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const items = await listMyWitnessQuestions(user, caseId, recordId);
    return ok(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load questions";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("WITNESS_QUESTIONS_LIST_FAILED", message, status);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const created = await createWitnessQuestion(user, caseId, recordId, body);
    return ok(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add question";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("WITNESS_QUESTION_CREATE_FAILED", message, status);
  }
}
