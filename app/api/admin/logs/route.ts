import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { listAdminActions } from "@/server/admin/service";

export async function GET() {
  try {
    const user = await ensureAppUser();
    return ok(await listAdminActions(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list admin logs";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden" || message === "Account suspended"
          ? 403
          : 400;
    return fail("ADMIN_LOGS_FAILED", message, status);
  }
}
