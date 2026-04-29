import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { addRecordComment } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string; recordId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, recordId } = await params;
    const user = await ensureAppUser();
    const result = await addRecordComment(user, caseId, "expertise", recordId, await request.json());
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add expertise comment";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("EXPERTISE_COMMENT_FAILED", message, status);
  }
}
