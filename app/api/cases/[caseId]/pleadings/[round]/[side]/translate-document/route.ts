import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { translatePleadingDocument } from "@/server/cases/pleadings";

type RouteProps = {
  params: Promise<{ caseId: string; round: string; side: string }>;
};

export const maxDuration = 120;

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, round, side } = await params;
    const user = await ensureAppUser();
    const result = await translatePleadingDocument(user, caseId, side, round);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate document";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only an active") ? 403 : 400;
    return fail("PLEADING_DOCUMENT_TRANSLATE_FAILED", message, status);
  }
}
