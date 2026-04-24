import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { resendConsultantInvitation } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const result = await resendConsultantInvitation(user, caseId, recordId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resend invitation";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("RESEND_FAILED", message, status);
  }
}
