import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { acceptJudgement, generateJudgement } from "@/server/ai/case-workflows";
import { judgementActionSchema } from "@/contracts/ai";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    console.log('Judgement API called for case:', caseId);
    
    const user = await ensureAppUser();
    console.log('User authenticated:', { id: user?.id, email: user?.email, role: user?.role });
    
    const rawBody = await request.json();
    console.log('Raw request body:', rawBody);
    
    const body = judgementActionSchema.parse(rawBody);
    console.log('Parsed body:', body);

    if (body.action === "generate") {
      console.log('Generating judgement...');
      const caseItem = await generateJudgement(user, caseId, body.clearSimulationData, body.clearDataImmediately);
      console.log('Judgement generated successfully');
      return ok(caseItem);
    }

    console.log('Accepting judgement...');
    const caseItem = await acceptJudgement(user, caseId);
    console.log('Judgement accepted successfully, case status:', caseItem.status);
    console.log('Returning case item:', { 
      id: caseItem.id, 
      status: caseItem.status, 
      finalDecision: caseItem.finalDecision 
    });
    return ok(caseItem);
  } catch (error) {
    console.error('Judgement API error:', error);
    const message = error instanceof Error ? error.message : "Failed to update judgement";
    const status =
      message === "Forbidden" || message === "Moderator access required"
        ? 403
        : message === "AI providers are not configured yet."
          ? 503
          : 400;
    return fail("JUDGEMENT_FAILED", message, status);
  }
}
