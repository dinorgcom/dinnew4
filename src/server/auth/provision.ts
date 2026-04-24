import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { kycVerifications, users } from "@/db/schema";
import { isDatabaseConfigured } from "@/server/runtime";

export type ProvisionedAppUser = {
  id?: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended";
  kycVerified: boolean;
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
      kycVerified: false,
    };
  }

  const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
  const db = getDb();

  async function resolveKycVerified(appUser: typeof users.$inferSelect): Promise<boolean> {
    if (!appUser.kycVerificationId) return false;
    const kycRow = await db
      .select({ status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, appUser.kycVerificationId))
      .limit(1);
    return kycRow[0]?.status === "verified";
  }

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

      const result = updated[0] ?? appUser;
      return { ...result, kycVerified: await resolveKycVerified(result) };
    }

    return { ...appUser, kycVerified: await resolveKycVerified(appUser) };
  }

  const existingByEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingByEmail[0]) {
    const appUser = existingByEmail[0];
    const updated = await db
      .update(users)
      .set({
        clerkUserId: userId,
        fullName,
      })
      .where(eq(users.id, appUser.id))
      .returning();

    const result = updated[0] ?? appUser;
    return { ...result, kycVerified: await resolveKycVerified(result) };
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
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: { email, fullName },
    })
    .returning();

  const newUser = inserted[0];
  if (newUser) {
    return { ...newUser, kycVerified: await resolveKycVerified(newUser) };
  }

  const raceWinner = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  return raceWinner[0] ? { ...raceWinner[0], kycVerified: await resolveKycVerified(raceWinner[0]) } : null;
}
