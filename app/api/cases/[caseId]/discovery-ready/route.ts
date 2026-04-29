import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { markDiscoveryReady } from "@/server/cases/hearing-proposals";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const result = await markDiscoveryReady(user, caseId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark ready";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("DISCOVERY_READY_FAILED", message, status);
  }
}
