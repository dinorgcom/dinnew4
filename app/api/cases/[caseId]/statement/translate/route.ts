import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { translateStatementText } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const url = new URL(request.url);
    const sideParam = url.searchParams.get("side");
    if (sideParam !== "claimant" && sideParam !== "respondent") {
      return fail("BAD_REQUEST", "side must be claimant or respondent", 400);
    }
    const result = await translateStatementText(user, caseId, sideParam);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the claimant") ? 403 : 400;
    return fail("STATEMENT_TRANSLATE_FAILED", message, status);
  }
}
