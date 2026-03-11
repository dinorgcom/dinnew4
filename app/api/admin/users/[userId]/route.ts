import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { updateAdminUserAccess } from "@/server/admin/service";

type RouteProps = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const user = await ensureAppUser();
    const body = await request.json();
    const { userId } = await params;
    return ok(await updateAdminUserAccess(user, userId, body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user access";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden" || message === "Account suspended"
          ? 403
          : 400;
    return fail("ADMIN_USER_UPDATE_FAILED", message, status);
  }
}
