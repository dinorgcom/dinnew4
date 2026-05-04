import { describe, expect, it } from "vitest";
import { NARRATIVE_QUESTION, normalizeScript } from "./scripted-hearings";

describe("normalizeScript", () => {
  it("prepends the required narrative question when the model omits it", () => {
    const script = normalizeScript("claimant", [
      {
        id: "issue-1",
        kind: "issue",
        participantRole: "claimant",
        primaryQuestion: "What happened after the payment deadline?",
        relatedEvidenceIds: ["ev_1"],
        maxFollowUps: 1,
      },
    ]);

    expect(script[0]).toMatchObject({
      id: "claimant-narrative",
      kind: "narrative",
      participantRole: "claimant",
      primaryQuestion: NARRATIVE_QUESTION,
    });
    expect(script[1]?.id).toBe("issue-1");
  });

  it("forces an existing first narrative item to use the required wording", () => {
    const script = normalizeScript("respondent", [
      {
        id: "custom-narrative",
        kind: "narrative",
        participantRole: "respondent",
        primaryQuestion: "Tell me your story.",
        relatedEvidenceIds: [],
        maxFollowUps: 0,
      },
    ]);

    expect(script).toHaveLength(1);
    expect(script[0]).toMatchObject({
      id: "custom-narrative",
      kind: "narrative",
      participantRole: "respondent",
      primaryQuestion: NARRATIVE_QUESTION,
      maxFollowUps: 1,
    });
  });
});
