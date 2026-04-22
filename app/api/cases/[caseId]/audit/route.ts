import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { listCaseAudits, requestAudit, deleteAudit } from "@/server/ai/case-workflows";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const audits = await listCaseAudits(user, caseId);
    return ok(audits);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load audits";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("AUDIT_LIST_FAILED", message, status);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const audit = await requestAudit(user, caseId, body);
    return ok(audit, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate audit";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("AUDIT_CREATE_FAILED", message, status);
  }
}

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get("auditId");
    
    if (!auditId) {
      return fail("AUDIT_DELETE_FAILED", "Audit ID is required", 400);
    }
    
    const deletedAudit = await deleteAudit(user, caseId, auditId);
    return ok(deletedAudit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete audit";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("AUDIT_DELETE_FAILED", message, status);
  }
}
