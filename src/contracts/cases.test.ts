import { describe, expect, it } from "vitest";
import { evidenceCreateSchema } from "./cases";

describe("evidenceCreateSchema", () => {
  it("accepts structured evidence context for judge hearing preparation", () => {
    const parsed = evidenceCreateSchema.parse({
      title: "Wire receipt",
      type: "financial_record",
      description: "Transfer confirmation",
      context: {
        whatThisEvidenceIs: "A bank transfer receipt.",
        whatThisEvidenceShows: "The claimant sent funds to the respondent.",
        importantDatesOrEvents: "Payment sent on 2026-01-12.",
        relatedClaimOrDefense: "Supports repayment claim.",
        peopleOrCompaniesInvolved: "Claimant, respondent, bank.",
        authenticityOrCompleteness: "Downloaded PDF from online banking.",
        conclusionForJudge: "The respondent received the loan amount.",
      },
    });

    expect(parsed.context?.conclusionForJudge).toBe("The respondent received the loan amount.");
  });
});
