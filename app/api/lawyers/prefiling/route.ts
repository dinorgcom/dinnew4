import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { generatePlainText, isAiConfigured } from "@/server/ai/service";

type Payload = {
  lawyerName?: string;
  lawyerStyle?: string;
  partyRole?: string;
  draftCaseData?: unknown;
  message?: string;
};

export async function POST(request: Request) {
  try {
    const user = await ensureAppUser();
    if (!user) {
      return fail("PREFILING_UNAUTHORIZED", "Unauthorized", 401);
    }

    if (!isAiConfigured()) {
      return ok({
        reply:
          "AI providers are not configured yet. Continue drafting the case details manually for now.",
      });
    }

    const body = (await request.json()) as Payload;
    const prompt = [
      `You are ${body.lawyerName || "a virtual arbitration lawyer"}.`,
      `Style: ${body.lawyerStyle || "strategic"}.`,
      `You are advising the ${body.partyRole || "claimant"} before the case is filed.`,
      "Give concise, practical drafting advice based on the current draft and user question.",
      "",
      "Draft case data:",
      JSON.stringify(body.draftCaseData || {}, null, 2),
      "",
      "User message:",
      body.message || "",
    ].join("\n");

    const reply = await generatePlainText(prompt);
    return ok({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to continue pre-filing chat";
    return fail("PREFILING_LAWYER_CHAT_FAILED", message, 400);
  }
}
