import { describe, expect, it } from "vitest";
import { getCaseCapabilities, resolveCaseRole, type CaseRole } from "@/server/cases/access";
import type { ProvisionedAppUser } from "@/server/auth/provision";

function user(overrides: Partial<ProvisionedAppUser>): ProvisionedAppUser {
  return {
    id: "user-1",
    clerkUserId: "clerk-1",
    email: "claimant@example.com",
    fullName: null,
    role: "user",
    accountStatus: "active",
    kycVerified: false,
    ...overrides,
  };
}

const caseItem = {
  id: "case-1",
  claimantEmail: "Claimant@Example.com",
  respondentEmail: "respondent@example.com",
  arbitratorAssignedUserId: "arb-1",
};

describe("case role resolution", () => {
  it("resolves claimant and respondent by normalized email", () => {
    expect(resolveCaseRole(caseItem, user({ email: "claimant@example.com" }))).toBe("claimant");
    expect(resolveCaseRole(caseItem, user({ email: "RESPONDENT@example.com" }))).toBe("respondent");
  });

  it("resolves admins, moderators, and assigned arbitrators as moderators", () => {
    expect(resolveCaseRole(caseItem, user({ email: "admin@example.com", role: "admin" }))).toBe("moderator");
    expect(resolveCaseRole(caseItem, user({ email: "mod@example.com", role: "moderator" }))).toBe("moderator");
    expect(resolveCaseRole(caseItem, user({ id: "arb-1", email: "arb@example.com" }))).toBe("moderator");
  });

  it("gives scoped admin impersonation precedence", () => {
    expect(
      resolveCaseRole(caseItem, user({ email: "admin@example.com", role: "admin" }), {
        caseId: "case-1",
        role: "respondent",
        targetEmail: "respondent@example.com",
        targetName: null,
      }),
    ).toBe("respondent");
  });

  it("denies unrelated users", () => {
    expect(resolveCaseRole(caseItem, user({ email: "other@example.com" }))).toBeNull();
  });
});

describe("case capabilities", () => {
  it.each<CaseRole>(["claimant", "respondent"])("allows party workflows for %s", (role) => {
    const capabilities = getCaseCapabilities(user({}), role);
    expect(capabilities.canView).toBe(true);
    expect(capabilities.canEditClaims).toBe(true);
    expect(capabilities.canAddWitnesses).toBe(true);
    expect(capabilities.canVoteHearingSlots).toBe(true);
    expect(capabilities.canScheduleHearing).toBe(false);
  });

  it("allows moderator hearing control but not party-only discovery actions", () => {
    const capabilities = getCaseCapabilities(user({ role: "moderator" }), "moderator");
    expect(capabilities.canView).toBe(true);
    expect(capabilities.canForceGenerateHearingProposal).toBe(true);
    expect(capabilities.canScheduleHearing).toBe(true);
    expect(capabilities.canAddWitnesses).toBe(false);
    expect(capabilities.canVoteHearingSlots).toBe(false);
  });
});
