import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  acceptArbitrationProposal,
  generateArbitrationProposal,
  rejectArbitrationProposal,
} from "@/server/ai/case-workflows";
import { arbitrationActionSchema } from "@/contracts/ai";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = arbitrationActionSchema.parse(await request.json());

    if (body.action === "generate") {
      const caseItem = await generateArbitrationProposal(user, caseId);
      return ok(caseItem);
    }

    if (body.action === "accept") {
      const caseItem = await acceptArbitrationProposal(user, caseId);
      return ok(caseItem);
    }

    const caseItem = await rejectArbitrationProposal(user, caseId, body.note);
    return ok(caseItem);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update arbitration";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("ARBITRATION_FAILED", message, status);
  }
}
