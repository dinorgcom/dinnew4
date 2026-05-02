import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  autoFinalizeOpenPartyProposals,
  inviteAdditionalParty,
} from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    // Lazy auto-finalize any open proposals whose deadline has passed.
    await autoFinalizeOpenPartyProposals(caseId);
    const record = await inviteAdditionalParty(user, caseId, body);
    return ok(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to invite party";
    const status = message.includes("Forbidden") || message.toLowerCase().includes("only") ? 403 : 400;
    return fail("PARTY_INVITE_FAILED", message, status);
  }
}
