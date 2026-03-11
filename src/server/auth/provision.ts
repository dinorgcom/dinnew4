import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { isDatabaseConfigured } from "@/server/runtime";

export type ProvisionedAppUser = {
  id?: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended";
};

export function assertAppUserActive(user: ProvisionedAppUser | null): asserts user is ProvisionedAppUser {
  if (!user) {
    throw new Error("Unauthorized");
  }
  if (user.accountStatus !== "active") {
    throw new Error("Account suspended");
  }
}

function getPrimaryEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    return null;
  }

  return user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? null;
}

export async function ensureAppUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  const email = getPrimaryEmail(clerkUser);
  if (!email || !isDatabaseConfigured()) {
    return {
      id: undefined,
      clerkUserId: userId,
      email: email ?? "",
      fullName: [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
      role: "user" as const,
      accountStatus: "active" as const,
    };
  }

  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
  const db = getDb();

  const existing = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (existing[0]) {
    const appUser = existing[0];
    const needsUpdate = appUser.email !== email || appUser.fullName !== fullName;

    if (needsUpdate) {
      const updated = await db
        .update(users)
        .set({
          email,
          fullName,
        })
        .where(and(eq(users.id, appUser.id), eq(users.clerkUserId, userId)))
        .returning();

      return updated[0] ?? appUser;
    }

    return appUser;
  }

  const inserted = await db
    .insert(users)
    .values({
      clerkUserId: userId,
      email,
      fullName,
      role: "user",
      accountStatus: "active",
    })
    .returning();

  return inserted[0] ?? null;
}
