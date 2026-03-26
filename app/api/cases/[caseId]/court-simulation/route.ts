import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { runAndPersistCourtSimulation, getStoredSimulation } from "@/lib/court-simulation-runner";
import { z } from "zod";

const simulateSchema = z.object({
  maxRounds: z.number().int().min(1).max(8).optional(),
  maxTokens: z.number().int().min(5000).max(100000).optional(),
});

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();

    const simulation = await getStoredSimulation(user, caseId);

    if (!simulation) {
      return ok({ simulation: null });
    }

    // Also get the case data to return all simulation-related fields
    const { getCaseDetail } = await import('@/server/cases/queries');
    const detail = await getCaseDetail(user, caseId);
    
    if (!detail) {
      return ok({ simulation: null });
    }

    return ok({
      simulation,
      timeline: simulation.timeline,
      // Include all the database fields
      simulationSessionId: detail.case.simulationSessionId,
      simulationShareToken: detail.case.simulationShareToken,
      simulationOutcomeType: detail.case.simulationOutcomeType,
      simulationStoppingReason: detail.case.simulationStoppingReason,
      simulationRounds: detail.case.simulationRounds,
      simulationTokensUsed: detail.case.simulationTokensUsed,
      simulationResult: detail.case.simulationResult,
      simulationTimeline: detail.case.simulationTimeline,
      simulationCompletedAt: detail.case.simulationCompletedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to get simulation";
    const status = message === "Forbidden" ? 403 : message === "Case not found" ? 404 : 500;
    return fail("SIMULATION_GET_FAILED", message, status);
  }
}

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const body = simulateSchema.parse(await request.json());

    const simulation = await runAndPersistCourtSimulation(user, caseId, body);

    return ok(simulation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run simulation";
    const status =
      message === "Forbidden" || message === "Moderator access required"
        ? 403
        : message === "Case not found"
        ? 404
        : message === "AI providers are not configured yet."
        ? 503
        : 400;
    return fail("SIMULATION_FAILED", message, status);
  }
}
