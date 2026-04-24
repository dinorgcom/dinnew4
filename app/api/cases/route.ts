import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { createCase } from "@/server/cases/mutations";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    const caseItem = await createCase(user, body);
    return ok(caseItem, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create case";
    if (message === "KYC_REQUIRED") {
      const draftCaseId = (error as Error & { draftCaseId?: string }).draftCaseId;
      return fail(
        "KYC_REQUIRED",
        "Identity verification required before filing",
        403,
        draftCaseId ? { draftCaseId } : undefined,
      );
    }
    return fail("CASE_CREATE_FAILED", message, message === "Unauthorized" ? 401 : 400);
  }
}
