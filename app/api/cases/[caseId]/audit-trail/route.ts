import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { listCaseAuditTrail } from "@/server/cases/audit-trail";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    return ok(await listCaseAuditTrail(user, caseId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load audit trail";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("AUDIT_TRAIL_FAILED", message, status);
  }
}
