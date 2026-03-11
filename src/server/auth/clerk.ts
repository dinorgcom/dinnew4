import { auth, currentUser } from "@clerk/nextjs/server";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isDatabaseConfigured } from "@/server/runtime";

export async function getAuthContext() {
  const { userId } = await auth();

  if (!userId) {
    return {
      isAuthenticated: false as const,
      clerkUserId: null,
      clerkUser: null,
      appUser: null,
    };
  }

  const clerkUser = await currentUser();
  const appUser = isDatabaseConfigured()
    ? await getDb().select().from(users).where(eq(users.clerkUserId, userId)).limit(1).then((rows) => rows[0] ?? null)
    : null;

  return {
    isAuthenticated: true as const,
    clerkUserId: userId,
    clerkUser,
    appUser: appUser ?? null,
  };
}
