import { and, eq } from "drizzle-orm";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getDb } from "@/db/client";
import { serviceTokens } from "@/db/schema";

type RouteProps = {
  params: Promise<{ tokenId: string }>;
};

export async function DELETE(_request: Request, { params }: RouteProps) {
  const user = await ensureAppUser();
  if (!user?.id) return fail("UNAUTHORIZED", "Not signed in", 401);
  if (user.authSource === "api") {
    return fail("FORBIDDEN", "API tokens cannot be revoked via the API", 403);
  }

  const { tokenId } = await params;
  const db = getDb();
  const updated = await db
    .update(serviceTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(serviceTokens.id, tokenId), eq(serviceTokens.userId, user.id)))
    .returning({ id: serviceTokens.id });

  if (updated.length === 0) {
    return fail("NOT_FOUND", "Token not found", 404);
  }
  return ok({ success: true });
}
