import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { createCheckout } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    const result = await createCheckout(user, body.packageId);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create checkout";
    const status = message === "Unauthorized" ? 401 : 400;
    return fail("CHECKOUT_FAILED", message, status);
  }
}

