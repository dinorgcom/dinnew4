import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { sanitizeStatementForArbitration } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

// Sanitize on a long PDF/DOCX runs two AI calls (extract verbatim text,
// then schema'd sanitize). For a real legal document of 20+ pages each
// can take 20-40s. Default Vercel serverless timeout is 10s on Hobby /
// 60s on Pro / 900s on Enterprise. We ask for 300s which Vercel clamps
// to the plan's max.
export const maxDuration = 300;

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const result = await sanitizeStatementForArbitration(user, caseId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sanitize statement";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the claimant") ? 403 : 400;
    return fail("STATEMENT_SANITIZE_FAILED", message, status);
  }
}
