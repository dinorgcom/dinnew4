import { fail } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { renderAuditTrailPdf } from "@/server/cases/audit-trail";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const pdf = await renderAuditTrailPdf(user, caseId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="case-${caseId}-audit-trail.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export audit trail";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("AUDIT_TRAIL_EXPORT_FAILED", message, status);
  }
}
