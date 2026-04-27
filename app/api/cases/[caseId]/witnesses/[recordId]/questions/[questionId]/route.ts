import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { deleteWitnessQuestion } from "@/server/cases/witness-questions";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string; questionId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, questionId } = await params;
    const user = await ensureAppUser();
    await deleteWitnessQuestion(user, caseId, questionId);
    return ok({ deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete question";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("WITNESS_QUESTION_DELETE_FAILED", message, status);
  }
}
