import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";

type CaseStatusInput = typeof cases.$inferSelect;

type HearingStatusInput = {
  status: string;
};

type ActivityStatusInput = {
  title: string;
};

export function calculateSmartStatus(
  caseItem: CaseStatusInput,
  hearingRows: HearingStatusInput[],
  activityRows: ActivityStatusInput[],
) {
  if (caseItem.finalDecision) {
    const decisionContent =
      typeof caseItem.finalDecision === "string" ? caseItem.finalDecision.toLowerCase() : "";

    const isAbortedProcess =
      decisionContent.includes("aborted") ||
      decisionContent.includes("failed") ||
      decisionContent.includes("incomplete");

    const isEvidenceIssueButSettled =
      decisionContent.includes("compromise settlement") ||
      decisionContent.includes("settlement of") ||
      decisionContent.includes("settled for") ||
      decisionContent.includes("agreed to pay");

    if (
      isAbortedProcess ||
      (decisionContent.includes("lack of evidence") && !isEvidenceIssueButSettled) ||
      (decisionContent.includes("insufficient") && !isEvidenceIssueButSettled)
    ) {
      if (caseItem.judgementJson) return "awaiting_decision";
      if (caseItem.arbitrationProposalJson) return "in_arbitration";
      return "filed";
    }

    return "resolved";
  }

  if (caseItem.judgementJson) return "awaiting_decision";
  if (caseItem.arbitrationProposalJson) return "in_arbitration";

  const activeHearing = hearingRows.find(
    (hearing) =>
      hearing.status === "scheduled" ||
      hearing.status === "in_progress" ||
      hearing.status === "ai_ready",
  );
  if (activeHearing) return "hearing_scheduled";

  if (activityRows.some((activity) => activity.title === "Defendant notified")) return "filed";

  return "draft";
}

export async function reconcileCaseStatusFromDetail(
  caseItem: CaseStatusInput,
  hearingRows: HearingStatusInput[],
  activityRows: ActivityStatusInput[],
) {
  const smartStatus = calculateSmartStatus(caseItem, hearingRows, activityRows);
  if (smartStatus !== caseItem.status) {
    await getDb().update(cases).set({ status: smartStatus }).where(eq(cases.id, caseItem.id));
    caseItem.status = smartStatus;
  }
  return smartStatus;
}

export async function touchCaseActivity(caseId: string, at = new Date()) {
  await getDb()
    .update(cases)
    .set({ lastActivityAt: at, updatedAt: at })
    .where(eq(cases.id, caseId));
}
