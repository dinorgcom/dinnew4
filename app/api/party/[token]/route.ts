import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  acceptPartyInvitation,
  declinePartyInvitation,
} from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ token: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { token } = await params;
    const body = (await request.json().catch(() => ({}))) as { action?: string };
    if (body.action === "decline") {
      const result = await declinePartyInvitation(token);
      return ok(result);
    }
    // Default action is accept; the invitee may not yet have an account
    // when they click the link, so ensureAppUser may return null. We allow
    // anonymous accept (the row stores email + invitation token) and
    // attach userId only if a session exists.
    const user = await ensureAppUser().catch(() => null);
    const result = await acceptPartyInvitation(token, user);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invitation failed";
    return fail("PARTY_INVITATION_FAILED", message, 400);
  }
}
