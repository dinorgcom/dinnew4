import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { spendForAction } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await spendForAction(user, body);
    if (!result.success) {
      return fail("TOKEN_SPEND_FAILED", result.error || "Failed to spend tokens", 402, result);
    }
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to spend tokens";
    const status = message === "Unauthorized" ? 401 : 400;
    return fail("TOKEN_SPEND_FAILED", message, status);
  }
}
