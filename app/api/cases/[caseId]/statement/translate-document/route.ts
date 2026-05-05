import { fail, ok } from "@/server/api/responses";
import { ensureAppUser } from "@/server/auth/provision";
import { translateStatementDocument } from "@/server/cases/mutations";

type RouteProps = {
  params: Promise<{ caseId: string }>;
};

// Note: this route can take 10–60s for a real legal document because
// DeepL's document API is async (upload → poll → download). The Next.js
// default function timeout on Vercel is 10s on Hobby; if a deploy is on
// that plan a 30+ page doc may exceed it. Pro plan = 60s, Enterprise =
// 900s. For now we just surface a clear error if it times out.
export const maxDuration = 120;

export async function POST(request: Request, { params }: RouteProps) {
  try {
    const { caseId } = await params;
    const user = await ensureAppUser();
    const url = new URL(request.url);
    const sideParam = url.searchParams.get("side");
    if (sideParam !== "claimant" && sideParam !== "respondent") {
      return fail("BAD_REQUEST", "side must be claimant or respondent", 400);
    }
    const result = await translateStatementDocument(user, caseId, sideParam);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to translate document";
    const status =
      message === "Forbidden" || message.toLowerCase().includes("only the claimant") ? 403 : 400;
    return fail("DOCUMENT_TRANSLATE_FAILED", message, status);
  }
}
