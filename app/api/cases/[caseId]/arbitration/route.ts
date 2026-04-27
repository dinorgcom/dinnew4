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

    const offer = body.settlementOfferUsd ?? null;

    if (body.action === "generate") {
      const caseItem = await generateArbitrationProposal(user, caseId, offer);
      return ok(caseItem);
    }

    if (body.action === "accept") {
      const caseItem = await acceptArbitrationProposal(user, caseId, body.arbitrationClaimantResponse, body.arbitrationRespondentResponse, offer);
      return ok(caseItem);
    }

    if (body.action === "reject") {
      const caseItem = await rejectArbitrationProposal(user, caseId, body.note, body.arbitrationClaimantResponse, body.arbitrationRespondentResponse, offer);
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
