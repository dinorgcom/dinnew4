import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { setUserTokenBalance } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    return ok(await setUserTokenBalance(user, body.userId, Number(body.targetBalance), body.reason));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update token balance";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return fail("TOKEN_BALANCE_SET_FAILED", message, status);
  }
}
