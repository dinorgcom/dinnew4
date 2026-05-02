import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseActivities, caseMessages, caseParties, cases, consultants, evidence, expertiseRequests, kycVerifications, lawyerConversations, lawyers, tokenLedger, users, witnesses, hearings, caseAudits } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { isDatabaseConfigured } from "@/server/runtime";
import { buildCaseAccessCondition, getCaseAccess, resolveCaseRole } from "@/server/cases/access";
import { reconcileCaseStatusFromDetail } from "@/server/cases/status";

type AppUser = ProvisionedAppUser | null;

type CaseFilters = {
  search?: string;
  status?: string;
};

function toRoleLabel(role: string | null) {
  switch (role) {
    case "claimant":
      return "Claimant";
    case "respondent":
      return "Respondent";
    case "moderator":
      return "Moderator";
    default:
      return "Viewer";
  }
}

function toCaseListItem(
  caseItem: typeof cases.$inferSelect,
  user: NonNullable<AppUser>,
  additionalPartySides: Map<string, "claimant" | "respondent"> = new Map(),
) {
  const additional = additionalPartySides.get(caseItem.id);
  const role = resolveCaseRole(
    caseItem,
    user,
    null,
    additional ? { side: additional } : null,
  );

  return {
    ...caseItem,
    role,
    roleLabel: toRoleLabel(role),
  };
}

export async function getCaseList(user: AppUser, filters: CaseFilters = {}) {
  if (!user || !isDatabaseConfigured()) {
    return {
      databaseReady: isDatabaseConfigured(),
      cases: [],
    };
  }

  const db = getDb();

  const clauses: SQL[] = [];
  const accessCondition = buildCaseAccessCondition(user);
  if (accessCondition) {
    clauses.push(accessCondition);
  }

  if (filters.search) {
    clauses.push(
      or(
        ilike(cases.caseNumber, `%${filters.search}%`),
        ilike(cases.title, `%${filters.search}%`),
        ilike(cases.claimantName, `%${filters.search}%`),
        ilike(cases.respondentName, `%${filters.search}%`),
      )!,
    );
  }

  if (filters.status && filters.status !== "all") {
    if (filters.status === "active") {
      clauses.push(
        inArray(cases.status, [
          "filed",
          "under_review",
          "hearing_scheduled",
          "in_arbitration",
          "awaiting_decision",
        ]),
      );
    } else {
      clauses.push(eq(cases.status, filters.status as typeof cases.$inferSelect.status));
    }
  }

  const query = db.select().from(cases).orderBy(desc(cases.updatedAt));

  const rows = clauses.length > 0 ? await query.where(and(...clauses)) : await query;

  // Bulk-load any additional-party memberships for this user across all
  // returned cases so co-claimants / co-respondents get the right role
  // label without an N+1 query.
  const additionalPartySides = new Map<string, "claimant" | "respondent">();
  const userEmail = (user.email || "").trim().toLowerCase();
  if (userEmail && rows.length > 0) {
    const ids = rows.map((row) => row.id);
    const partyRows = await db
      .select({ caseId: caseParties.caseId, side: caseParties.side })
      .from(caseParties)
      .where(
        and(
          inArray(caseParties.caseId, ids),
          eq(caseParties.status, "active"),
          sql`lower(${caseParties.email}) = ${userEmail}`,
        ),
      );
    for (const row of partyRows) {
      additionalPartySides.set(row.caseId, row.side);
    }
  }

  return {
    databaseReady: true,
    cases: rows.map((caseItem) => toCaseListItem(caseItem, user, additionalPartySides)),
  };
}

export async function getDashboardData(user: AppUser) {
  const list = await getCaseList(user);

  if (!user || !list.databaseReady) {
    return {
      databaseReady: list.databaseReady,
      recentCases: [],
      activities: [],
      stats: {
        totalCases: 0,
        activeCases: 0,
        resolvedCases: 0,
        urgentCases: 0,
      },
    };
  }

  const db = getDb();
  const recentCases = list.cases.slice(0, 5);
  const caseIds = recentCases.map((caseItem) => caseItem.id);
  const activityRows = caseIds.length
    ? await db
        .select({
          id: caseActivities.id,
          caseId: caseActivities.caseId,
          type: caseActivities.type,
          title: caseActivities.title,
          createdAt: caseActivities.createdAt,
          caseTitle: cases.title,
        })
        .from(caseActivities)
        .innerJoin(cases, eq(cases.id, caseActivities.caseId))
        .where(inArray(caseActivities.caseId, caseIds))
        .orderBy(desc(caseActivities.createdAt))
        .limit(10)
    : [];

  return {
    databaseReady: true,
    recentCases,
    activities: activityRows,
    stats: {
      totalCases: list.cases.length,
      activeCases: list.cases.filter((caseItem) =>
        [
          "filed",
          "under_review",
          "hearing_scheduled",
          "in_arbitration",
          "awaiting_decision",
        ].includes(caseItem.status),
      ).length,
      resolvedCases: list.cases.filter((caseItem) => caseItem.status === "resolved").length,
      urgentCases: list.cases.filter((caseItem) =>
        caseItem.priority === "urgent" || caseItem.priority === "high",
      ).length,
    },
  };
}

export async function getRoleDashboardData(user: AppUser, targetRole: "claimant" | "respondent") {
  const list = await getCaseList(user);

  if (!user || !list.databaseReady) {
    return {
      databaseReady: list.databaseReady,
      role: targetRole,
      cases: [],
      activities: [],
      stats: {
        total: 0,
        active: 0,
        resolved: 0,
        urgent: 0,
      },
    };
  }

  const filteredCases = list.cases.filter((caseItem) => caseItem.role === targetRole);
  const db = getDb();
  const caseIds = filteredCases.map((caseItem) => caseItem.id);
  const activities = caseIds.length
    ? await db
        .select()
        .from(caseActivities)
        .where(inArray(caseActivities.caseId, caseIds))
        .orderBy(desc(caseActivities.createdAt))
        .limit(20)
    : [];

  return {
    databaseReady: true,
    role: targetRole,
    cases: filteredCases,
    activities,
    stats: {
      total: filteredCases.length,
      active: filteredCases.filter((caseItem) =>
        ["filed", "under_review", "hearing_scheduled", "in_arbitration", "awaiting_decision"].includes(caseItem.status),
      ).length,
      resolved: filteredCases.filter((caseItem) => caseItem.status === "resolved").length,
      urgent: filteredCases.filter((caseItem) =>
        caseItem.priority === "urgent" || caseItem.priority === "high",
      ).length,
    },
  };
}

export async function getCaseDetail(user: AppUser, caseId: string) {
  if (!user || !isDatabaseConfigured()) {
    return null;
  }

  const access = await getCaseAccess(user, caseId);
  if (!access) {
    return null;
  }
  const db = getDb();
  const caseItem = access.case;
  const role = access.caseRole;
  const impersonation = access.impersonation;

  const [activityRows, evidenceRows, witnessRows, consultantRows, lawyerRows, partyRows, expertiseRows, messageRows, conversations, auditRows, notificationCheck, claimantKycRows, respondentKycRows] = await Promise.all([
    db
      .select()
      .from(caseActivities)
      .where(eq(caseActivities.caseId, caseId))
      .orderBy(desc(caseActivities.createdAt))
      .limit(8),
    db.select().from(evidence).where(eq(evidence.caseId, caseId)).orderBy(desc(evidence.createdAt)),
    db.select({ witness: witnesses, kycStatus: kycVerifications.status, kycVerifiedAt: kycVerifications.verifiedAt }).from(witnesses).leftJoin(kycVerifications, eq(witnesses.kycVerificationId, kycVerifications.id)).where(eq(witnesses.caseId, caseId)).orderBy(desc(witnesses.createdAt)),
    db.select({ consultant: consultants, kycStatus: kycVerifications.status, kycVerifiedAt: kycVerifications.verifiedAt }).from(consultants).leftJoin(kycVerifications, eq(consultants.kycVerificationId, kycVerifications.id)).where(eq(consultants.caseId, caseId)).orderBy(desc(consultants.createdAt)),
    db.select({ lawyer: lawyers, kycStatus: kycVerifications.status, kycVerifiedAt: kycVerifications.verifiedAt }).from(lawyers).leftJoin(kycVerifications, eq(lawyers.kycVerificationId, kycVerifications.id)).where(eq(lawyers.caseId, caseId)).orderBy(desc(lawyers.createdAt)),
    db.select({ party: caseParties, kycStatus: kycVerifications.status, kycVerifiedAt: kycVerifications.verifiedAt }).from(caseParties).leftJoin(kycVerifications, eq(caseParties.kycVerificationId, kycVerifications.id)).where(eq(caseParties.caseId, caseId)).orderBy(desc(caseParties.createdAt)),
    db.select().from(expertiseRequests).where(eq(expertiseRequests.caseId, caseId)).orderBy(desc(expertiseRequests.createdAt)),
    db.select().from(caseMessages).where(eq(caseMessages.caseId, caseId)).orderBy(desc(caseMessages.createdAt)).limit(20),
    (() => {
      const lawyerEmail = impersonation?.targetEmail || user.email;
      return lawyerEmail
        ? db
            .select()
            .from(lawyerConversations)
            .where(
              and(
                eq(lawyerConversations.caseId, caseId),
                eq(lawyerConversations.userEmail, lawyerEmail),
              ),
            )
            .orderBy(desc(lawyerConversations.updatedAt))
            .limit(1)
        : Promise.resolve([]);
    })(),
    db.select().from(caseAudits).where(eq(caseAudits.caseId, caseId)).orderBy(desc(caseAudits.createdAt)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(caseActivities)
      .where(and(
        eq(caseActivities.caseId, caseId),
        eq(caseActivities.title, "Defendant notified")
      )),
    caseItem.claimantKycVerificationId
      ? db.select().from(kycVerifications).where(eq(kycVerifications.id, caseItem.claimantKycVerificationId)).limit(1)
      : Promise.resolve([]),
    caseItem.respondentKycVerificationId
      ? db.select().from(kycVerifications).where(eq(kycVerifications.id, caseItem.respondentKycVerificationId)).limit(1)
      : Promise.resolve([]),
  ]);

  // Check if case has any hearings
  const hearingRows = await db.select().from(hearings).where(eq(hearings.caseId, caseId));
  const hasHearing = hearingRows.length > 0;

  await reconcileCaseStatusFromDetail(caseItem, hearingRows, activityRows);

  const respondentNotified = notificationCheck[0]?.count > 0;

  const todoItems = [
    !caseItem.claimantLawyerKey ? { key: "claimant-lawyer", label: "Claimant must choose a lawyer" } : null,
    !caseItem.respondentLawyerKey && caseItem.respondentEmail ? { key: "respondent-lawyer", label: "Respondent must choose a lawyer" } : null,
    caseItem.status === "draft" ? { key: "file-case", label: "File the case to start the workflow" } : null,
    evidenceRows.length === 0 ? { key: "add-evidence", label: "Add initial evidence" } : null,
    witnessRows.length === 0 ? { key: "add-witness", label: "Add witnesses if relevant" } : null,
    !respondentNotified && caseItem.status !== "draft"
      ? { key: "notify-respondent", label: "Notify the respondent" }
      : null,
    caseItem.status === "filed" && !hasHearing
      ? { key: "schedule-hearing", label: "Schedule a hearing or review" }
      : null,
  ].filter((item): item is { key: string; label: string } => item !== null);

  const progressStages = [
    { key: "filed", label: "Filed", active: caseItem.status !== "draft" },
    { key: "notified", label: "Respondent notified", active: respondentNotified },
    { key: "evidence", label: "Evidence gathering", active: evidenceRows.length > 0 },
    { key: "hearing", label: "Hearing scheduled", active: caseItem.status === "hearing_scheduled" || hasHearing },
    { key: "decision", label: "Decision phase", active: ["in_arbitration", "awaiting_decision", "resolved"].includes(caseItem.status) },
  ];

  // Flatten joined witness/consultant/lawyer results to include kycStatus
  const flatWitnesses = witnessRows.map((row) => ({ ...row.witness, kycStatus: row.kycStatus, kycVerifiedAt: row.kycVerifiedAt }));
  const flatConsultants = consultantRows.map((row) => ({ ...row.consultant, kycStatus: row.kycStatus, kycVerifiedAt: row.kycVerifiedAt }));
  const flatLawyers = lawyerRows.map((row) => ({ ...row.lawyer, kycStatus: row.kycStatus, kycVerifiedAt: row.kycVerifiedAt }));
  const flatParties = partyRows.map((row) => ({ ...row.party, kycStatus: row.kycStatus, kycVerifiedAt: row.kycVerifiedAt }));
  const viewerEmailLower = (user.email || "").trim().toLowerCase();
  const viewerPartyId =
    flatParties.find(
      (party) =>
        party.status === "active" &&
        (party.email || "").trim().toLowerCase() === viewerEmailLower,
    )?.id ?? null;

  // Aggregate token spend for this case grouped by user, then map to claimant/respondent.
  const ledgerRows = await db
    .select({
      userId: tokenLedger.userId,
      email: users.email,
      delta: tokenLedger.delta,
    })
    .from(tokenLedger)
    .leftJoin(users, eq(users.id, tokenLedger.userId))
    .where(and(eq(tokenLedger.caseId, caseId), eq(tokenLedger.status, "committed")));

  const claimantEmail = (caseItem.claimantEmail || "").trim().toLowerCase();
  const respondentEmail = (caseItem.respondentEmail || "").trim().toLowerCase();
  let claimantTokensSpent = 0;
  let respondentTokensSpent = 0;
  let otherTokensSpent = 0;
  for (const row of ledgerRows) {
    if (row.delta >= 0) continue;
    const email = (row.email || "").trim().toLowerCase();
    const spent = -row.delta;
    if (email && email === claimantEmail) claimantTokensSpent += spent;
    else if (email && email === respondentEmail) respondentTokensSpent += spent;
    else otherTokensSpent += spent;
  }
  const tokenCosts = {
    claimant: claimantTokensSpent,
    respondent: respondentTokensSpent,
    other: otherTokensSpent,
    total: claimantTokensSpent + respondentTokensSpent + otherTokensSpent,
  };

  return {
    case: caseItem,
    role,
    roleLabel: toRoleLabel(role),
    impersonation: impersonation
      ? {
          role: impersonation.role,
          targetEmail: impersonation.targetEmail,
          targetName: impersonation.targetName,
        }
      : null,
    activities: activityRows,
    evidence: evidenceRows,
    witnesses: flatWitnesses,
    consultants: flatConsultants,
    lawyers: flatLawyers,
    parties: flatParties,
    viewerPartyId,
    expertiseRequests: expertiseRows,
    messages: messageRows,
    conversation: conversations[0] ?? null,
    audits: auditRows,
    hearings: hearingRows,
    respondentNotified,
    claimantKyc: (claimantKycRows[0] ?? null) as typeof kycVerifications.$inferSelect | null,
    respondentKyc: (respondentKycRows[0] ?? null) as typeof kycVerifications.$inferSelect | null,
    todoItems,
    progressStages,
    summaryCards: [
      { label: "Evidence", value: evidenceRows.length },
      { label: "Witnesses", value: flatWitnesses.length },
      { label: "Consultants", value: flatConsultants.length },
      { label: "Lawyers", value: flatLawyers.length },
      { label: "Expertise", value: expertiseRows.length },
    ],
    tokenCosts,
  };
}
