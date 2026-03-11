import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

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
  const appUser = await db.query.users.findFirst({
    where: eq(users.clerkUserId, userId),
  });

  return {
    isAuthenticated: true as const,
    clerkUserId: userId,
    clerkUser,
    appUser: appUser ?? null,
  };
}
