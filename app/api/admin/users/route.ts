import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { listUsersWithBalances } from "@/server/billing/service";

export async function GET() {
  try {
    const user = await ensureAppUser();
    return ok(await listUsersWithBalances(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list users";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return fail("ADMIN_USERS_FAILED", message, status);
  }
}

