import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { savePleading } from "@/server/cases/pleadings";

type RouteProps = {
  params: Promise<{ caseId: string; round: string; side: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { caseId, round, side } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await savePleading(user, caseId, side, round, body);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save pleading";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the") ? 403 : 400;
    return fail("PLEADING_SAVE_FAILED", message, status);
  }
}
