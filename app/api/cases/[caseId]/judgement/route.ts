import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { acceptJudgement, generateJudgement } from "@/server/ai/case-workflows";
import { judgementActionSchema } from "@/contracts/ai";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = judgementActionSchema.parse(await request.json());

    if (body.action === "generate") {
      const caseItem = await generateJudgement(user, caseId);
      return ok(caseItem);
    }

    const caseItem = await acceptJudgement(user, caseId);
    return ok(caseItem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update judgement";
    const status =
      message === "Forbidden" || message === "Moderator access required"
        ? 403
        : message === "AI providers are not configured yet."
          ? 503
          : 400;
    return fail("JUDGEMENT_FAILED", message, status);
  }
}
