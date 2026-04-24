import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { updateCase } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const caseItem = await updateCase(user, caseId, body);
    return ok(caseItem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update case";
    if (message === "KYC_REQUIRED") {
      const draftCaseId = (error as Error & { draftCaseId?: string }).draftCaseId;
      return fail(
        "KYC_REQUIRED",
        "Identity verification required before filing",
        403,
        draftCaseId ? { draftCaseId } : undefined,
      );
    }
    const status = message === "Forbidden" ? 403 : 400;
    return fail("CASE_UPDATE_FAILED", message, status);
  }
}
