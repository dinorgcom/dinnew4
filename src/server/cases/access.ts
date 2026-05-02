import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseParties, cases } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { assertAppUserActive } from "@/server/auth/provision";
import { getImpersonationContext, type ImpersonationContext } from "@/server/auth/impersonation";

export type CaseRole = "claimant" | "respondent" | "moderator";

export type CaseCapabilities = {
  canView: boolean;
  canAdministerUsers: boolean;
  canEditCaseDetails: boolean;
  canEditOwnContacts: boolean;
  canEditClaims: boolean;
  canAddEvidence: boolean;
  canAddWitnesses: boolean;
  canAddConsultants: boolean;
  canRequestExpertise: boolean;
  canMessage: boolean;
  canNotifyRespondent: boolean;
  canSelectLawyer: boolean;
  canMarkDiscoveryReady: boolean;
  canGenerateHearingProposal: boolean;
  canForceGenerateHearingProposal: boolean;
  canVoteHearingSlots: boolean;
  canConfirmHearingSlot: boolean;
  canScheduleHearing: boolean;
  canRunAiWorkflows: boolean;
};

export type CaseAccess = {
  case: typeof cases.$inferSelect;
  caseRole: CaseRole;
  role: CaseRole;
  appRole: ProvisionedAppUser["role"];
  impersonation: ImpersonationContext | null;
  capabilities: CaseCapabilities;
};

export type AuthorizedCase = {
  case: typeof cases.$inferSelect;
  role: CaseRole;
  impersonation: ImpersonationContext | null;
};

type AppUser = ProvisionedAppUser | null;

type CaseRoleInput = {
  id: string;
  claimantEmail: string | null;
  respondentEmail: string | null;
  arbitratorAssignedUserId: string | null;
};

export function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

export function resolveCaseRole(
  caseItem: CaseRoleInput,
  user: ProvisionedAppUser,
  impersonation: ImpersonationContext | null = null,
  additionalParty: { side: "claimant" | "respondent" } | null = null,
): CaseRole | null {
  if (impersonation && impersonation.caseId === caseItem.id) {
    return impersonation.role;
  }

  const userEmail = normalizeEmail(user.email);
  if (normalizeEmail(caseItem.claimantEmail) === userEmail) {
    return "claimant";
  }
  if (normalizeEmail(caseItem.respondentEmail) === userEmail) {
    return "respondent";
  }
  // Co-claimants / co-respondents added via the multi-party flow.
  if (additionalParty) {
    return additionalParty.side;
  }
  if (
    user.role === "admin" ||
    user.role === "moderator" ||
    (user.id ? caseItem.arbitratorAssignedUserId === user.id : false)
  ) {
    return "moderator";
  }

  return null;
}

export function buildCaseAccessCondition(user: ProvisionedAppUser): SQL | undefined {
  if (user.role === "admin" || user.role === "moderator") {
    return undefined;
  }

  const normalizedEmail = normalizeEmail(user.email);
  // Match either the original claimant/respondent on the cases table, or any
  // active co-party in case_parties (multi-party support).
  return or(
    sql`lower(${cases.claimantEmail}) = ${normalizedEmail}`,
    sql`lower(${cases.respondentEmail}) = ${normalizedEmail}`,
    sql`EXISTS (
      SELECT 1 FROM ${caseParties}
      WHERE ${caseParties.caseId} = ${cases.id}
        AND ${caseParties.status} = 'active'
        AND lower(${caseParties.email}) = ${normalizedEmail}
    )`,
    ...(user.id ? [eq(cases.arbitratorAssignedUserId, user.id)] : []),
  );
}

export function getCaseCapabilities(
  user: ProvisionedAppUser,
  caseRole: CaseRole,
): CaseCapabilities {
  const isParty = caseRole === "claimant" || caseRole === "respondent";
  const isModerator = caseRole === "moderator";

  return {
    canView: true,
    canAdministerUsers: user.role === "admin",
    canEditCaseDetails: true,
    canEditOwnContacts: isParty,
    canEditClaims: isParty,
    canAddEvidence: true,
    canAddWitnesses: isParty,
    canAddConsultants: isParty,
    canRequestExpertise: isParty,
    canMessage: true,
    canNotifyRespondent: caseRole === "claimant",
    canSelectLawyer: isParty,
    canMarkDiscoveryReady: isParty,
    canGenerateHearingProposal: isParty || isModerator,
    canForceGenerateHearingProposal: isModerator,
    canVoteHearingSlots: isParty,
    canConfirmHearingSlot: isParty || isModerator,
    canScheduleHearing: isModerator,
    canRunAiWorkflows: true,
  };
}

export async function getCaseAccess(user: AppUser, caseId: string): Promise<CaseAccess | null> {
  assertAppUserActive(user);

  const db = getDb();
  const rows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = rows[0];
  if (!caseItem) {
    return null;
  }

  const impersonation = await getImpersonationContext(user, caseId);

  // Look up additional party membership: anyone added later via the
  // multi-party flow inherits the same role label as the original
  // claimant/respondent on their side.
  let additionalParty: { side: "claimant" | "respondent" } | null = null;
  const userEmail = normalizeEmail(user.email);
  if (
    userEmail &&
    userEmail !== normalizeEmail(caseItem.claimantEmail) &&
    userEmail !== normalizeEmail(caseItem.respondentEmail)
  ) {
    const partyRows = await db
      .select({ side: caseParties.side })
      .from(caseParties)
      .where(
        and(
          eq(caseParties.caseId, caseId),
          eq(caseParties.status, "active"),
          sql`lower(${caseParties.email}) = ${userEmail}`,
        ),
      )
      .limit(1);
    if (partyRows[0]) {
      additionalParty = { side: partyRows[0].side };
    }
  }

  const caseRole = resolveCaseRole(caseItem, user, impersonation, additionalParty);
  if (!caseRole) {
    return null;
  }

  return {
    case: caseItem,
    caseRole,
    role: caseRole,
    appRole: user.role,
    impersonation,
    capabilities: getCaseCapabilities(user, caseRole),
  };
}

export async function getAuthorizedCase(user: AppUser, caseId: string): Promise<AuthorizedCase | null> {
  const access = await getCaseAccess(user, caseId);
  return access
    ? {
        case: access.case,
        role: access.caseRole,
        impersonation: access.impersonation,
      }
    : null;
}
