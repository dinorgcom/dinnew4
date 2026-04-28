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

    const rangeLow = body.rangeLowUsd ?? null;
    const rangeHigh = body.rangeHighUsd ?? null;
    const rationaleEdit = body.rationaleText ?? null;

    if (body.action === "generate") {
      const caseItem = await generateArbitrationProposal(user, caseId, rangeLow, rangeHigh, rationaleEdit);
      return ok(caseItem);
    }

    if (body.action === "accept") {
      const caseItem = await acceptArbitrationProposal(user, caseId, body.arbitrationClaimantResponse, body.arbitrationRespondentResponse, rangeLow, rangeHigh, rationaleEdit);
      return ok(caseItem);
    }

    if (body.action === "reject") {
      const caseItem = await rejectArbitrationProposal(user, caseId, body.note, body.arbitrationClaimantResponse, body.arbitrationRespondentResponse, rangeLow, rangeHigh, rationaleEdit);
      return ok(caseItem);
    }

    return fail("INVALID_ACTION", "Invalid action specified", 400);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update arbitration";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("ARBITRATION_FAILED", message, status);
  }
}
