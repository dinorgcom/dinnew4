import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { sanitizePleading } from "@/server/cases/pleadings";

type RouteProps = {
  params: Promise<{ caseId: string; round: string; side: string }>;
};

// Long pleading + AI sanitize can take 30-60s — give the route plenty
// of headroom. Vercel clamps to the plan's max.
export const maxDuration = 300;

export async function POST(_request: Request, { params }: RouteProps) {
  try {
    const { caseId, round, side } = await params;
    const user = await ensureAppUser();
    const result = await sanitizePleading(user, caseId, side, round);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sanitize pleading";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the") ? 403 : 400;
    return fail("PLEADING_SANITIZE_FAILED", message, status);
  }
}
