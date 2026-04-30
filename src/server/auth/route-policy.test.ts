import { describe, expect, it } from "vitest";
import { isPublicRoutePath } from "@/server/auth/route-policy";

describe("route policy", () => {
  it("keeps intentionally public routes public", () => {
    expect(isPublicRoutePath("/")).toBe(true);
    expect(isPublicRoutePath("/sign-in")).toBe(true);
    expect(isPublicRoutePath("/sign-up/foo")).toBe(true);
    expect(isPublicRoutePath("/witness/invite-token")).toBe(true);
    expect(isPublicRoutePath("/consultant/invite-token/result")).toBe(true);
    expect(isPublicRoutePath("/api/public/witness-verify")).toBe(true);
    expect(isPublicRoutePath("/api/billing/pricing")).toBe(true);
    expect(isPublicRoutePath("/api/billing/webhook")).toBe(true);
    expect(isPublicRoutePath("/api/health")).toBe(true);
  });

  it("protects app and technical routes", () => {
    expect(isPublicRoutePath("/claimant")).toBe(false);
    expect(isPublicRoutePath("/respondent")).toBe(false);
    expect(isPublicRoutePath("/billing")).toBe(false);
    expect(isPublicRoutePath("/settings")).toBe(false);
    expect(isPublicRoutePath("/terms")).toBe(false);
    expect(isPublicRoutePath("/cases/case_123")).toBe(false);
    expect(isPublicRoutePath("/api/anam/session")).toBe(false);
    expect(isPublicRoutePath("/api/anam/cleanup")).toBe(false);
    expect(isPublicRoutePath("/api/livekit/token")).toBe(false);
    expect(isPublicRoutePath("/api/lawyers/prefiling")).toBe(false);
    expect(isPublicRoutePath("/api/auth/connect")).toBe(false);
  });
});
