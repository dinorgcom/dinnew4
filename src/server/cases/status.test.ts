import { describe, expect, it } from "vitest";
import { calculateSmartStatus } from "@/server/cases/status";

function caseItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "case-1",
    status: "draft",
    finalDecision: null,
    judgementJson: null,
    arbitrationProposalJson: null,
    ...overrides,
  } as any;
}

describe("calculateSmartStatus", () => {
  it("prioritizes genuine final decisions as resolved", () => {
    expect(calculateSmartStatus(caseItem({ finalDecision: "Award granted." }), [], [])).toBe("resolved");
  });

  it("does not treat aborted decisions as resolved", () => {
    expect(calculateSmartStatus(caseItem({ finalDecision: "Process aborted due to incomplete evidence." }), [], [])).toBe(
      "filed",
    );
  });

  it("detects decision, arbitration, hearing, and filing states", () => {
    expect(calculateSmartStatus(caseItem({ judgementJson: { ok: true } }), [], [])).toBe("awaiting_decision");
    expect(calculateSmartStatus(caseItem({ arbitrationProposalJson: { ok: true } }), [], [])).toBe("in_arbitration");
    expect(calculateSmartStatus(caseItem(), [{ status: "scheduled" }], [])).toBe("hearing_scheduled");
    expect(calculateSmartStatus(caseItem(), [], [{ title: "Defendant notified" }])).toBe("filed");
  });
});
