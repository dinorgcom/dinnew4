import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  autoFinalizeHearingProposalIfDue,
  confirmHearingSlot,
  generateHearingProposal,
  getActiveHearingProposal,
  isDiscoveryComplete,
  voteAvailability,
} from "@/server/cases/hearing-proposals";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    await ensureAppUser();
    // Lazy auto-finalize: every read triggers a check; if voting deadline
    // has passed and there's a clear winner the proposal is confirmed and
    // the corresponding hearings row is created on the spot.
    await autoFinalizeHearingProposalIfDue(caseId);
    const [proposal, discovery] = await Promise.all([
      getActiveHearingProposal(caseId),
      isDiscoveryComplete(caseId),
    ]);
    return ok({ proposal, discovery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load proposal";
    return fail("HEARING_PROPOSAL_LOAD_FAILED", message, 400);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json().catch(() => ({}));
    const action = body?.action;
    if (action === "generate") {
      const proposal = await generateHearingProposal(user, caseId);
      return ok(proposal, { status: 201 });
    }
    if (action === "vote") {
      const updated = await voteAvailability(user, caseId, body);
      return ok(updated);
    }
    if (action === "confirm") {
      const result = await confirmHearingSlot(user, caseId, body);
      return ok(result);
    }
    return fail("HEARING_PROPOSAL_BAD_ACTION", "Unknown action", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("HEARING_PROPOSAL_FAILED", message, status);
  }
}
