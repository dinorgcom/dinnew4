import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { translatePleadingText } from "@/server/cases/pleadings";

type RouteProps = {
  params: Promise<{ caseId: string; round: string; side: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, round, side } = await params;
    const user = await ensureAppUser();
    const result = await translatePleadingText(user, caseId, side, round);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate pleading";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only an active") ? 403 : 400;
    return fail("PLEADING_TRANSLATE_FAILED", message, status);
  }
}
