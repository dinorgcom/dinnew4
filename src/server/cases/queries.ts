import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseActivities, cases, consultants, evidence, expertiseRequests, witnesses } from "@/db/schema";
import type { ProvisionedAppUser } from "@/server/auth/provision";
import { isDatabaseConfigured } from "@/server/runtime";

type AppUser = ProvisionedAppUser | null;

type CaseFilters = {
  search?: string;
  status?: string;
};

function normalizeEmail(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function resolveCaseRole(caseItem: typeof cases.$inferSelect, user: NonNullable<AppUser>) {
  const userEmail = normalizeEmail(user.email);

  if (normalizeEmail(caseItem.claimantEmail) === userEmail) {
    return "claimant";
  }
  if (normalizeEmail(caseItem.respondentEmail) === userEmail) {
    return "respondent";
  }
  if (user.role === "admin") {
    return "admin";
  }
  if (user.role === "moderator") {
    return "moderator";
  }
  if (caseItem.arbitratorAssignedUserId && caseItem.arbitratorAssignedUserId === user.id) {
    return "moderator";
  }

  return null;
}

function buildAccessCondition(user: NonNullable<AppUser>) {
  if (user.role === "admin" || user.role === "moderator") {
    return undefined;
  }

  const normalizedEmail = normalizeEmail(user.email);

  return or(
    sql`lower(${cases.claimantEmail}) = ${normalizedEmail}`,
    sql`lower(${cases.respondentEmail}) = ${normalizedEmail}`,
    ...(user.id ? [eq(cases.arbitratorAssignedUserId, user.id)] : []),
  );
}

function toRoleLabel(role: string | null) {
  switch (role) {
    case "claimant":
      return "Claimant";
    case "respondent":
      return "Respondent";
    case "moderator":
      return "Moderator";
    case "admin":
      return "Admin";
    default:
      return "Viewer";
  }
}

function toCaseListItem(caseItem: typeof cases.$inferSelect, user: NonNullable<AppUser>) {
  const role = resolveCaseRole(caseItem, user);

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
  const accessCondition = buildAccessCondition(user);
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

  return {
    databaseReady: true,
    cases: rows.map((caseItem) => toCaseListItem(caseItem, user)),
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

export async function getCaseDetail(user: AppUser, caseId: string) {
  if (!user || !isDatabaseConfigured()) {
    return null;
  }

  const db = getDb();

  const caseRow = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  const caseItem = caseRow[0];

  if (!caseItem) {
    return null;
  }

  const role = resolveCaseRole(caseItem, user);
  if (!role) {
    return null;
  }

  const [activityRows, evidenceCount, witnessCount, consultantCount, expertiseCount] = await Promise.all([
    db
      .select()
      .from(caseActivities)
      .where(eq(caseActivities.caseId, caseId))
      .orderBy(desc(caseActivities.createdAt))
      .limit(8),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(evidence)
      .where(eq(evidence.caseId, caseId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(witnesses)
      .where(eq(witnesses.caseId, caseId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(consultants)
      .where(eq(consultants.caseId, caseId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(expertiseRequests)
      .where(eq(expertiseRequests.caseId, caseId)),
  ]);

  return {
    case: caseItem,
    role,
    roleLabel: toRoleLabel(role),
    activities: activityRows,
    summaryCards: [
      { label: "Evidence", value: evidenceCount[0]?.count ?? 0 },
      { label: "Witnesses", value: witnessCount[0]?.count ?? 0 },
      { label: "Consultants", value: consultantCount[0]?.count ?? 0 },
      { label: "Expertise", value: expertiseCount[0]?.count ?? 0 },
    ],
  };
}
