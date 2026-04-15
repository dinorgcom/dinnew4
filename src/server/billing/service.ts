import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { adminUserActions, processedStripeEvents, tokenLedger, users } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { assertAppUserActive } from "@/server/auth/provision";
import { env } from "@/lib/env";
import { ACTION_LABELS, ACTION_COSTS, getActionCost, getPackageById, TOKEN_PACKAGES } from "./config";
import { getStripe } from "./stripe";

type AppUser = ProvisionedAppUser | null;

export async function getTokenBalance(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ balance: sql<number>`coalesce(sum(${tokenLedger.delta}), 0)::int` })
    .from(tokenLedger)
    .where(eq(tokenLedger.userId, userId));

  return rows[0]?.balance ?? 0;
}

export async function appendLedgerEntry(input: typeof tokenLedger.$inferInsert) {
  const db = getDb();
  const existing = await db
    .select()
    .from(tokenLedger)
    .where(and(eq(tokenLedger.userId, input.userId), eq(tokenLedger.idempotencyKey, input.idempotencyKey)))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  const inserted = await db.insert(tokenLedger).values(input).returning();
  return inserted[0];
}

export async function previewSpend(user: AppUser, actionCode: string) {
  assertAppUserActive(user);
  if (!user.id) {
    throw new Error("Unauthorized");
  }

  const required = getActionCost(actionCode);
  if (required === null) {
    throw new Error("Unknown actionCode");
  }

  const current = await getTokenBalance(user.id);
  const shortfall = Math.max(required - current, 0);

  return {
    actionCode,
    required,
    current,
    shortfall,
    canAfford: shortfall === 0,
  };
}

export async function spendForAction(user: AppUser, input: {
  actionCode: keyof typeof ACTION_COSTS;
  caseId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}) {
  assertAppUserActive(user);
  if (!user.id) {
    throw new Error("Unauthorized");
  }

  if (user.role === "admin" || user.role === "moderator") {
    return {
      success: true,
      replayed: false,
      previousBalance: await getTokenBalance(user.id),
      amountDeducted: 0,
      newBalance: await getTokenBalance(user.id),
      bypassed: true,
    };
  }

  const required = getActionCost(input.actionCode);
  if (required === null) {
    throw new Error("Unknown actionCode");
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(tokenLedger)
    .where(and(eq(tokenLedger.userId, user.id), eq(tokenLedger.idempotencyKey, input.idempotencyKey)))
    .limit(1);

  const previousBalance = await getTokenBalance(user.id);
  if (existing[0]) {
    return {
      success: true,
      replayed: true,
      previousBalance,
      amountDeducted: required,
      newBalance: previousBalance,
    };
  }

  if (previousBalance < required) {
    return {
      success: false,
      error: "Insufficient tokens",
      required,
      current: previousBalance,
      shortfall: required - previousBalance,
    };
  }

  await appendLedgerEntry({
    userId: user.id,
    caseId: input.caseId ?? null,
    delta: required * -1,
    kind: "spend",
    status: "committed",
    idempotencyKey: input.idempotencyKey,
    metadataJson: {
      actionCode: input.actionCode,
      label: ACTION_LABELS[input.actionCode],
      ...(input.metadata ?? {}),
    },
    createdBy: user.id,
  });

  return {
    success: true,
    replayed: false,
    previousBalance,
    amountDeducted: required,
    newBalance: await getTokenBalance(user.id),
  };
}

export function getPricing() {
  return {
    actionCosts: Object.entries(ACTION_COSTS).map(([actionCode, tokens]) => ({
      actionCode,
      label: ACTION_LABELS[actionCode as keyof typeof ACTION_LABELS] ?? actionCode,
      tokens,
      isFree: tokens === 0,
    })),
    packages: TOKEN_PACKAGES.map((pkg) => ({
      packageId: pkg.packageId,
      label: pkg.label,
      tokens: pkg.tokens,
      priceUsd: pkg.priceUsd,
      priceId: env[pkg.priceEnvKey] || null,
    })),
  };
}

export async function createCheckout(user: AppUser, packageId: string) {
  assertAppUserActive(user);
  if (!user.id) {
    throw new Error("Unauthorized");
  }

  const selected = getPackageById(packageId);
  if (!selected) {
    throw new Error("Invalid packageId");
  }

  const priceId = env[selected.priceEnvKey];
  if (!priceId) {
    throw new Error(`${selected.priceEnvKey} is not configured.`);
  }

  const stripe = getStripe();
  const origin = env.NEXT_PUBLIC_APP_URL;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=true`,
    cancel_url: `${origin}/billing?canceled=true`,
    customer_email: user.email,
    metadata: {
      user_id: user.id,
      package_id: packageId,
    },
  });

  return {
    url: session.url,
  };
}

export async function processStripeWebhook(body: string, signature: string | null) {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  }

  const stripe = getStripe();
  const event = stripe.webhooks.constructEvent(body, signature || "", webhookSecret);

  if (event.type.startsWith("identity.verification_session.")) {
    const { processIdentityWebhookEvent } = await import("@/server/identity/service");
    return processIdentityWebhookEvent(event);
  }

  if (event.type !== "checkout.session.completed") {
    return { received: true, ignored: true };
  }

  const session = event.data.object;
  const userId = session.metadata?.user_id;
  const packageId = session.metadata?.package_id;
  if (!userId || !packageId) {
    throw new Error("Missing checkout metadata.");
  }

  const selected = getPackageById(packageId);
  if (!selected) {
    throw new Error("Unknown package id.");
  }

  const db = getDb();
  const replay = await db.select().from(processedStripeEvents).where(eq(processedStripeEvents.eventId, event.id)).limit(1);
  if (replay[0]) {
    return { received: true, replayed: true };
  }

  await appendLedgerEntry({
    userId,
    delta: selected.tokens,
    kind: "purchase",
    status: "committed",
    idempotencyKey: `stripe:${event.id}`,
    stripeSessionId: session.id,
    stripeEventId: event.id,
    metadataJson: {
      packageId: selected.packageId,
      label: selected.label,
      priceUsd: selected.priceUsd,
    },
    createdBy: "stripe_webhook",
  });

  await db.insert(processedStripeEvents).values({
    eventId: event.id,
    sessionId: session.id,
    userId,
    packageId: selected.packageId,
    creditedTokens: selected.tokens,
    processedAt: new Date(),
  });

  return { received: true };
}

export async function listUsersWithBalances(actor: AppUser) {
  assertAppUserActive(actor);
  if (!actor.id) {
    throw new Error("Unauthorized");
  }
  if (actor.role !== "admin") {
    throw new Error("Forbidden");
  }

  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      accountStatus: users.accountStatus,
      balance: sql<number>`coalesce(sum(${tokenLedger.delta}), 0)::int`,
    })
    .from(users)
    .leftJoin(tokenLedger, eq(tokenLedger.userId, users.id))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  return rows;
}

export async function setUserTokenBalance(actor: AppUser, targetUserId: string, targetBalance: number, reason?: string) {
  assertAppUserActive(actor);
  if (!actor.id) {
    throw new Error("Unauthorized");
  }
  if (actor.role !== "admin") {
    throw new Error("Forbidden");
  }
  if (!Number.isFinite(targetBalance) || targetBalance < 0) {
    throw new Error("targetBalance must be a non-negative number");
  }

  const db = getDb();
  const targetRows = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  const target = targetRows[0];
  if (!target) {
    throw new Error("User not found");
  }

  const currentBalance = await getTokenBalance(targetUserId);
  const delta = targetBalance - currentBalance;

  if (delta !== 0) {
    await appendLedgerEntry({
      userId: targetUserId,
      delta,
      kind: delta > 0 ? "admin_adjustment_credit" : "admin_adjustment_debit",
      status: "committed",
      idempotencyKey: `admin-balance:${targetUserId}:${targetBalance}:${Date.now()}`,
      metadataJson: {
        reason: reason || "Admin token balance adjustment",
      },
      createdBy: actor.id,
    });
  }

  const newBalance = await getTokenBalance(targetUserId);
  await db.insert(adminUserActions).values({
    adminUserId: actor.id,
    adminEmail: actor.email,
    targetUserId,
    targetEmail: target.email,
    action: "set_tokens",
    beforeJson: { token_balance: currentBalance },
    afterJson: { token_balance: newBalance },
    reason: reason || "Admin token balance adjustment",
  });

  return {
    previousBalance: currentBalance,
    targetBalance,
    newBalance,
    delta,
  };
}
