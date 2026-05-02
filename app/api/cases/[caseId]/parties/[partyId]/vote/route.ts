import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { voteOnPartyAddition } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; partyId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, partyId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await voteOnPartyAddition(user, caseId, partyId, body);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record vote";
    const status = message.includes("Forbidden") || message.toLowerCase().includes("only") ? 403 : 400;
    return fail("PARTY_VOTE_FAILED", message, status);
  }
}
