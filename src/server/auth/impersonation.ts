import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { isDatabaseConfigured } from "@/server/runtime";

export const IMPERSONATION_COOKIE = "admin_impersonation";

export type ImpersonationRole = "claimant" | "respondent";

export type ImpersonationCookie = {
  caseId: string;
  role: ImpersonationRole;
};

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
    const parsed = JSON.parse(raw) as Partial<ImpersonationCookie>;
    if (!parsed.caseId || (parsed.role !== "claimant" && parsed.role !== "respondent")) {
      return null;
    }
    return { caseId: parsed.caseId, role: parsed.role };
  } catch {
    return null;
  }
}

export async function writeImpersonationCookie(value: ImpersonationCookie) {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, JSON.stringify(value), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearImpersonationCookie() {
  const store = await cookies();
  store.delete(IMPERSONATION_COOKIE);
}

export async function getImpersonationContext(
  user: ProvisionedAppUser | null,
  caseId: string,
): Promise<ImpersonationContext | null> {
  if (!user || user.role !== "admin" || !isDatabaseConfigured()) {
    return null;
  }

  const cookie = await readImpersonationCookie();
  if (!cookie || cookie.caseId !== caseId) {
    return null;
  }

  const db = getDb();
  const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = rows[0];
  if (!caseItem) {
    return null;
  }

  const email =
    cookie.role === "claimant"
      ? normalizeEmail(caseItem.claimantEmail)
      : normalizeEmail(caseItem.respondentEmail);

  if (!email) {
    return null;
  }

  return {
    caseId,
    role: cookie.role,
    targetEmail: email,
    targetName: cookie.role === "claimant" ? caseItem.claimantName : caseItem.respondentName,
  };
}

export function hasAdminBypass(
  user: ProvisionedAppUser | null,
  impersonation: ImpersonationContext | null,
) {
  return user?.role === "admin" && !impersonation;
}

export function formatPerformedBy(
  user: ProvisionedAppUser | null,
  context: ImpersonationContext | null,
  fallback = "Unknown user",
) {
  const base = user?.fullName || user?.email || fallback;
  if (context) {
    return `[Admin:${user?.email ?? "unknown"} as ${context.role}] ${base}`;
  }
  return base;
}
