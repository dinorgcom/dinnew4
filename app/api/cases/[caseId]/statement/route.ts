import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { updateCaseStatement } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await updateCaseStatement(user, caseId, body);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update statement";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the claimant") ? 403 : 400;
    return fail("STATEMENT_UPDATE_FAILED", message, status);
  }
}
