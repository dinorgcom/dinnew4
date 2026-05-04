import { z } from "zod";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  postScriptedHearingMessage,
  startScriptedHearingSession,
} from "@/server/cases/scripted-hearings";

type RouteProps = {
  params: Promise<{ caseId: string; sessionId: string }>;
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("message"), content: z.string().trim().min(1).max(8000) }),
]);

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId, sessionId } = await params;
    const user = await ensureAppUser();
    const body = actionSchema.parse(await request.json());
    if (body.action === "start") {
      return ok(await startScriptedHearingSession(user, caseId, sessionId));
    }
    return ok(await postScriptedHearingMessage(user, caseId, sessionId, body.content));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update hearing session";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("SCRIPTED_HEARING_SESSION_FAILED", message, status);
  }
}
