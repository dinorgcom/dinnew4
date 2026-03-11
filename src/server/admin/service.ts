import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adminUserActions, tokenLedger, users } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { assertAppUserActive } from "@/server/auth/provision";
import { adminUserUpdateSchema } from "@/contracts/admin";

type AppUser = ProvisionedAppUser | null;

function assertAdmin(actor: AppUser): asserts actor is ProvisionedAppUser {
  assertAppUserActive(actor);
  if (!actor.id) {
    throw new Error("Unauthorized");
  }
  if (actor.role !== "admin") {
    throw new Error("Forbidden");
  }
}

export async function listAdminUsers(actor: AppUser) {
  assertAdmin(actor);
  const db = getDb();

  return db
    .select({
      id: users.id,
      clerkUserId: users.clerkUserId,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      accountStatus: users.accountStatus,
      suspensionReason: users.suspensionReason,
      suspendedAt: users.suspendedAt,
      createdAt: users.createdAt,
      balance: sql<number>`coalesce(sum(${tokenLedger.delta}), 0)::int`,
    })
    .from(users)
    .leftJoin(tokenLedger, eq(tokenLedger.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));
}

export async function listAdminActions(actor: AppUser, limit = 50) {
  assertAdmin(actor);
  const db = getDb();

  return db
    .select({
      id: adminUserActions.id,
      action: adminUserActions.action,
      adminEmail: adminUserActions.adminEmail,
      targetEmail: adminUserActions.targetEmail,
      beforeJson: adminUserActions.beforeJson,
      afterJson: adminUserActions.afterJson,
      reason: adminUserActions.reason,
      createdAt: adminUserActions.createdAt,
    })
    .from(adminUserActions)
    .orderBy(desc(adminUserActions.createdAt))
    .limit(limit);
}

export async function updateAdminUserAccess(
  actor: AppUser,
  userId: string,
  payload: unknown,
) {
  assertAdmin(actor);
  const parsed = adminUserUpdateSchema.parse(payload);
  const db = getDb();
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = rows[0];

  if (!target) {
    throw new Error("User not found");
  }

  if (target.id === actor.id && parsed.accountStatus === "suspended") {
    throw new Error("You cannot suspend your own account.");
  }

  const updated = await db
    .update(users)
    .set({
      role: parsed.role,
      accountStatus: parsed.accountStatus,
      suspensionReason: parsed.accountStatus === "suspended" ? parsed.reason : null,
      suspendedAt: parsed.accountStatus === "suspended" ? new Date() : null,
      suspendedByUserId: parsed.accountStatus === "suspended" ? actor.id : null,
    })
    .where(and(eq(users.id, userId), eq(users.email, target.email)))
    .returning();

  const next = updated[0];

  await db.insert(adminUserActions).values({
    adminUserId: actor.id,
    adminEmail: actor.email,
    targetUserId: target.id,
    targetEmail: target.email,
    action: "set_user_access",
    beforeJson: {
      role: target.role,
      account_status: target.accountStatus,
      suspension_reason: target.suspensionReason,
    },
    afterJson: {
      role: next.role,
      account_status: next.accountStatus,
      suspension_reason: next.suspensionReason,
    },
    reason: parsed.reason,
  });

  return next;
}
