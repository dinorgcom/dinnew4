import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { submitPleading } from "@/server/cases/pleadings";

type RouteProps = {
  params: Promise<{ caseId: string; round: string; side: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, round, side } = await params;
    const user = await ensureAppUser();
    const result = await submitPleading(user, caseId, side, round);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to submit pleading";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the") ? 403 : 400;
    return fail("PLEADING_SUBMIT_FAILED", message, status);
  }
}
