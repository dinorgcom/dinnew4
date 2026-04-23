import { eq } from "drizzle-orm";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  clearImpersonationCookie,
  writeImpersonationCookie,
  type ImpersonationRole,
} from "@/server/auth/impersonation";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";

async function requireAdmin() {
  const user = await ensureAppUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  if (user.role !== "admin") {
    throw new Error("Forbidden");
  }
  return user;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { caseId?: unknown; role?: unknown };
    const caseId = typeof body.caseId === "string" ? body.caseId : null;
    const role =
      body.role === "claimant" || body.role === "respondent"
        ? (body.role as ImpersonationRole)
        : null;

    if (!caseId || !role) {
      return fail("IMPERSONATE_INVALID", "caseId and role ('claimant'|'respondent') are required", 400);
    }

    const db = getDb();
    const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    const caseItem = rows[0];
    if (!caseItem) {
      return fail("IMPERSONATE_CASE_NOT_FOUND", "Case not found", 404);
    }

    const partyEmail =
      role === "claimant" ? caseItem.claimantEmail : caseItem.respondentEmail;
    if (!partyEmail) {
      return fail(
        "IMPERSONATE_PARTY_MISSING",
        `Case has no ${role} email on record to impersonate`,
        400,
      );
    }

    await writeImpersonationCookie({ caseId, role });
    return ok({ caseId, role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to set impersonation";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return fail("IMPERSONATE_FAILED", message, status);
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    await clearImpersonationCookie();
    return ok({ cleared: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear impersonation";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400;
    return fail("IMPERSONATE_FAILED", message, status);
  }
}
