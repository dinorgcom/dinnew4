import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { createVerificationSession } from "@/server/identity/service";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const result = await createVerificationSession(user, new URL(request.url).origin);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create verification session";
    const status = message === "Unauthorized" ? 401 : 400;
    return fail("IDENTITY_SESSION_FAILED", message, status);
  }
}
