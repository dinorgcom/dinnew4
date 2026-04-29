import { fail } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { renderCaseSummaryPdf } from "@/server/cases/summary-export";

export const runtime = "nodejs";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const { searchParams } = new URL(request.url);
    const auditId = searchParams.get("auditId");
    if (!auditId) {
      return fail("SUMMARY_EXPORT_FAILED", "Summary ID is required", 400);
    }

    const pdf = await renderCaseSummaryPdf(user, caseId, auditId);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="case-${caseId}-summary.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export summary";
    const status = message === "Forbidden" ? 403 : message === "Summary not found" ? 404 : 400;
    return fail("SUMMARY_EXPORT_FAILED", message, status);
  }
}
