import { auth, currentUser } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { getDb } from "@/db/client";
import { kycVerifications, serviceTokens, users } from "@/db/schema";
import { isDatabaseConfigured } from "@/server/runtime";

export type AuthSource = "web" | "api";

export type ProvisionedAppUser = {
  id?: string;
  clerkUserId: string;
  email: string;
  fullName: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended";
  kycVerified: boolean;
  authSource: AuthSource;
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

export function hashApiToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

async function resolveKycVerified(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const db = getDb();
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const appUser = userRows[0];
  if (!appUser?.kycVerificationId) return false;
  const kycRow = await db
    .select({ status: kycVerifications.status })
    .from(kycVerifications)
    .where(eq(kycVerifications.id, appUser.kycVerificationId))
    .limit(1);
  return kycRow[0]?.status === "verified";
}

async function tryAuthWithApiToken(): Promise<ProvisionedAppUser | null> {
  if (!isDatabaseConfigured()) return null;

  let header: string | null = null;
  try {
    const h = await headers();
    header = h.get("authorization");
  } catch {
    // Not in a request context (e.g. background job) — no API token possible.
    return null;
  }
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null;

  const plain = header.slice("bearer ".length).trim();
  if (!plain.startsWith("din_pat_")) return null;

  const tokenHash = hashApiToken(plain);
  const db = getDb();
  const tokenRows = await db
    .select({
      tokenId: serviceTokens.id,
      userId: serviceTokens.userId,
      revokedAt: serviceTokens.revokedAt,
    })
    .from(serviceTokens)
    .where(eq(serviceTokens.tokenHash, tokenHash))
    .limit(1);

  const tokenRow = tokenRows[0];
  if (!tokenRow || tokenRow.revokedAt) return null;

  const userRows = await db.select().from(users).where(eq(users.id, tokenRow.userId)).limit(1);
  const appUser = userRows[0];
  if (!appUser) return null;

  // Touch lastUsedAt — best-effort, don't fail auth if it errors.
  void db
    .update(serviceTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(serviceTokens.id, tokenRow.tokenId))
    .catch(() => {
      // ignore
    });

  return {
    ...appUser,
    kycVerified: await resolveKycVerified(appUser.id),
    authSource: "api",
  };
}

export async function ensureAppUser(): Promise<ProvisionedAppUser | null> {
  // 1. API-token path takes priority. Allows scripts/LLM agents to act as
  //    a real user without going through Clerk's session cookie.
  const apiUser = await tryAuthWithApiToken();
  if (apiUser) return apiUser;

  // 2. Fall back to Clerk session cookie (browser).
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
      authSource: "web",
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

      const result = updated[0] ?? appUser;
      return { ...result, kycVerified: await resolveKycVerified(result.id), authSource: "web" };
    }

    return { ...appUser, kycVerified: await resolveKycVerified(appUser.id), authSource: "web" };
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
    return { ...result, kycVerified: await resolveKycVerified(result.id), authSource: "web" };
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
    return { ...newUser, kycVerified: await resolveKycVerified(newUser.id), authSource: "web" };
  }

  const raceWinner = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  return raceWinner[0]
    ? { ...raceWinner[0], kycVerified: await resolveKycVerified(raceWinner[0].id), authSource: "web" }
    : null;
}
