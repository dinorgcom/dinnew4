import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getVerificationStatus } from "@/server/identity/service";

export async function GET() {
  try {
    const user = await ensureAppUser();
    if (!user || !user.id) {
      return fail("UNAUTHORIZED", "Unauthorized", 401);
    }
    const result = await getVerificationStatus(user.id);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get verification status";
    const status = message === "Unauthorized" ? 401 : 400;
    return fail("IDENTITY_STATUS_FAILED", message, status);
  }
}
