import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { continueLawyerChat, getLawyerConversation } from "@/server/ai/case-workflows";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(_: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const conversation = await getLawyerConversation(user, caseId);
    return ok(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lawyer chat";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("LAWYER_CHAT_GET_FAILED", message, status);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = await request.json();
    const conversation = await continueLawyerChat(user, caseId, body);
    return ok(conversation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to continue lawyer chat";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("LAWYER_CHAT_POST_FAILED", message, status);
  }
}
