import { eq } from "drizzle-orm";
import { z } from "zod";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

const bodySchema = z.object({
  pref: z.enum(["all", "necessary_only"]),
});

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    if (!user?.id) {
      return fail("UNAUTHORIZED", "Not signed in", 401);
    }
    const body = bodySchema.parse(await request.json());
    const db = getDb();
    await db
      .update(users)
      .set({ notificationPref: body.pref, updatedAt: new Date() })
      .where(eq(users.id, user.id));
    return ok({ pref: body.pref });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save notifications";
    return fail("NOTIFICATION_PREF_FAILED", message, 400);
  }
}
