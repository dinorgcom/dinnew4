import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { reviewParticipant } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await reviewParticipant(user, caseId, "witnesses", recordId, body);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to review witness";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("WITNESS_REVIEW_FAILED", message, status);
  }
}
