import { z } from "zod";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { getAuthorizedCase, createCaseActivity } from "@/server/cases/mutations";
import { spendForAction } from "@/server/billing/service";
import { ACTION_COSTS } from "@/server/billing/config";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

const appealSchema = z.object({
  jurors: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7)]),
  reason: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const authorized = await getAuthorizedCase(user, caseId);
    if (!authorized) {
      return fail("APPEAL_FORBIDDEN", "Forbidden", 403);
    }
    if (authorized.role !== "claimant" && authorized.role !== "respondent") {
      return fail("APPEAL_FORBIDDEN", "Only the claimant or respondent can request an appeal.", 403);
    }
    const body = appealSchema.parse(await request.json());

    // Charge the per-juror cost once per juror.
    for (let i = 0; i < body.jurors; i += 1) {
      const spend = await spendForAction(user, {
        actionCode: "appeal_request",
        caseId,
        idempotencyKey: `appeal:${caseId}:${user?.id ?? "anon"}:${Date.now()}:${i}`,
        metadata: { jurors: body.jurors, jurorIndex: i },
      });
      if (!spend.success) {
        return fail("APPEAL_INSUFFICIENT", spend.error || "Insufficient tokens", 400);
      }
    }

    await createCaseActivity(
      caseId,
      "note",
      "Appeal requested",
      `Appeal requested with ${body.jurors} juror${body.jurors === 1 ? "" : "s"} (${ACTION_COSTS.appeal_request * body.jurors} tokens). ${body.reason ?? ""}`.trim(),
      { user, impersonation: authorized.impersonation },
    );

    return ok({ jurors: body.jurors, totalCost: ACTION_COSTS.appeal_request * body.jurors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Appeal request failed";
    return fail("APPEAL_FAILED", message, 400);
  }
}
