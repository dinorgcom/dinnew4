import { z } from "zod";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { runExpertiseWorkflow } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

const bodySchema = z.object({
  action: z.enum(["generate", "accept", "regenerate", "finalize", "reject"]),
});

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const body = bodySchema.parse(await request.json());
    const result = await runExpertiseWorkflow(user, caseId, recordId, body.action);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update expertise";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("EXPERTISE_WORKFLOW_FAILED", message, status);
  }
}
