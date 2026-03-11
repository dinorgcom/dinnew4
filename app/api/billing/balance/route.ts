import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getTokenBalance } from "@/server/billing/service";

export async function GET() {
  try {
    const user = await ensureAppUser();
    if (!user?.id) {
      return fail("UNAUTHORIZED", "Unauthorized", 401);
    }
    return ok({ balance: await getTokenBalance(user.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load balance";
    return fail("BALANCE_FAILED", message, 400);
  }
}

