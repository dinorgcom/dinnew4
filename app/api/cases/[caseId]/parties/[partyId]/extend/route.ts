import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { extendPartyApprovalDeadline } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; partyId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, partyId } = await params;
    const user = await ensureAppUser();
    const result = await extendPartyApprovalDeadline(user, caseId, partyId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extend approval deadline";
    const status =
      message.includes("Forbidden") || message.toLowerCase().includes("only") ? 403 : 400;
    return fail("PARTY_EXTEND_FAILED", message, status);
  }
}
