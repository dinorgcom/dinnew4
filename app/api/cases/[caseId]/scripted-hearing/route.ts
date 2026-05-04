import { z } from "zod";
import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import {
  generateScriptedHearingPreparation,
  getScriptedHearingFlow,
} from "@/server/cases/scripted-hearings";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

const actionSchema = z.object({
  action: z.literal("generate_preparation"),
});

export async function GET(_request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    return ok(await getScriptedHearingFlow(user, caseId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load scripted hearing";
    const status = message === "Forbidden" ? 403 : 400;
    return fail("SCRIPTED_HEARING_LOAD_FAILED", message, status);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = actionSchema.parse(await request.json());
    if (body.action === "generate_preparation") {
      return ok(await generateScriptedHearingPreparation(user, caseId));
    }
    return fail("INVALID_ACTION", "Invalid action specified", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update scripted hearing";
    const status =
      message === "Forbidden" ? 403 : message === "AI providers are not configured yet." ? 503 : 400;
    return fail("SCRIPTED_HEARING_UPDATE_FAILED", message, status);
  }
}
