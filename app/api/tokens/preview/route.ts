import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { previewSpend } from "@/server/billing/service";

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    return ok(await previewSpend(user, body.actionCode));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to preview token spend";
    const status = message === "Unauthorized" ? 401 : 400;
    return fail("TOKEN_PREVIEW_FAILED", message, status);
  }
}

