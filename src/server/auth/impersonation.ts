import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { isDatabaseConfigured } from "@/server/runtime";

export const IMPERSONATION_COOKIE = "admin_impersonation";

const impersonationRoleSchema = z.enum(["claimant", "respondent"]);

const impersonationCookieSchema = z.object({
  caseId: z.string().min(1),
  role: impersonationRoleSchema,
});

export type ImpersonationRole = z.infer<typeof impersonationRoleSchema>;

export type ImpersonationCookie = z.infer<typeof impersonationCookieSchema>;

export type ImpersonationContext = {
  caseId: string;
  role: ImpersonationRole;
  targetEmail: string;
  targetName: string | null;
};

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export async function readImpersonationCookie(): Promise<ImpersonationCookie | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) {
    return null;
  }
  try {
    const result = impersonationCookieSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const IMPERSONATION_COOKIE_MAX_AGE_SECONDS = 60 * 60;

export async function writeImpersonationCookie(value: ImpersonationCookie) {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    // Keep path at "/" because the cookie is consumed from both /cases/*
    // pages and /api/cases/* workflow routes with no shared narrow prefix.
    // Offset the broader path with sameSite: "strict" so the cookie never
    // travels on cross-site navigations — impersonation must be initiated
    // from within the admin UI itself.
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearImpersonationCookie() {
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);
}

// Next.js 15 forbids cookie mutations from Server Component render contexts.
// getImpersonationContext runs from both Route Handlers/Server Actions (where
// deletion is allowed) and Server Components (where it throws). Swallow the
// error so the read path stays a no-op; the cookie will still be cleared the
// next time the admin hits a mutation route.
async function tryClearImpersonationCookie() {
  try {
    await clearImpersonationCookie();
  } catch {
    // Ignore: cookie will be cleared on the next mutation-capable request or
    // when it hits its maxAge.
  }
}

export async function getImpersonationContext(
  user: ProvisionedAppUser | null,
  caseId: string,
): Promise<ImpersonationContext | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  const cookie = await readImpersonationCookie();
  if (!cookie) {
    return null;
  }

  // Non-admin with an impersonation cookie is always stale — an admin
  // downgraded or the cookie leaked somehow. Drop it.
  if (!user || user.role !== "admin") {
    await tryClearImpersonationCookie();
    return null;
  }

  if (cookie.caseId !== caseId) {
    return null;
  }

  const db = getDb();
  const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = rows[0];
  if (!caseItem) {
    // Case no longer exists — the cookie points at nothing. Clear it.
    await tryClearImpersonationCookie();
    return null;
  }

  const email =
    cookie.role === "claimant"
      ? normalizeEmail(caseItem.claimantEmail)
      : normalizeEmail(caseItem.respondentEmail);

  if (!email) {
    // The case exists but the target party no longer has an email. Clear it.
    await tryClearImpersonationCookie();
    return null;
  }

  return {
    caseId,
    role: cookie.role,
    targetEmail: email,
    targetName: cookie.role === "claimant" ? caseItem.claimantName : caseItem.respondentName,
  };
}

export function formatPerformedBy(
  user: ProvisionedAppUser | null,
  context: ImpersonationContext | null,
  fallback = "Unknown user",
) {
  // No user and no impersonation context = the system itself recorded the
  // event (e.g. KYC verification confirmations). Surface that distinctly so
  // the activity log doesn't read as "Unknown user".
  if (!user && !context) {
    return "system";
  }
  const base = user?.fullName || user?.email || fallback;
  if (context) {
    return `[Admin:${user?.email ?? "unknown"} as ${context.role}] ${base}`;
  }
  return base;
}
