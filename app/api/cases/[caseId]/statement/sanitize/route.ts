import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { sanitizeStatementForArbitration } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

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
