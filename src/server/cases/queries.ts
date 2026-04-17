import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseActivities, caseMessages, cases, consultants, evidence, expertiseRequests, kycVerifications, lawyerConversations, witnesses, hearings, caseAudits } from "@/db/schema";
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

function calculateSmartStatus(caseItem: typeof cases.$inferSelect, hearingRows: any[], activityRows: any[]) {
  // Priority order: resolved > awaiting_decision > in_arbitration > hearing_scheduled > filed > draft
  
  // 1. Check if truly resolved (not just aborted/failed judgement)
  if (caseItem.finalDecision) {
    // Check if this is a genuine resolution vs aborted process
    const decisionContent = typeof caseItem.finalDecision === 'string' ? caseItem.finalDecision.toLowerCase() : '';
    
    // Don't treat aborted/failed processes as final resolutions
    if (decisionContent.includes('aborted') || 
        decisionContent.includes('lack of evidence') || 
        decisionContent.includes('insufficient') ||
        decisionContent.includes('failed') ||
        decisionContent.includes('incomplete')) {
      // This is a failed process, not a final resolution
      if (caseItem.judgementJson) return "awaiting_decision";
      if (caseItem.arbitrationProposalJson) return "in_arbitration";
      return "filed";
    }
    
    return "resolved";
  }
  
  // 2. Check if in decision phase
  if (caseItem.judgementJson) return "awaiting_decision";
  
  // 3. Check if in arbitration
  if (caseItem.arbitrationProposalJson) return "in_arbitration";
  
  // 4. Check if hearing is actually scheduled (not cancelled)
  const activeHearing = hearingRows.find(h => 
    h.status === "scheduled" || h.status === "in_progress" || h.status === "ai_ready"
  );
  if (activeHearing) return "hearing_scheduled";
  
  // 5. Check if filed (has notification activity)
  if (activityRows.some(a => a.title === "Defendant notified")) return "filed";
  
  // 6. Default to draft
  return "draft";
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

  const [activityRows, evidenceRows, witnessRows, consultantRows, expertiseRows, messageRows, conversations, auditRows] = await Promise.all([
    db
      .select()
      .from(caseActivities)
      .where(eq(caseActivities.caseId, caseId))
      .orderBy(desc(caseActivities.createdAt))
      .limit(8),
    db.select().from(evidence).where(eq(evidence.caseId, caseId)).orderBy(desc(evidence.createdAt)),
    db.select({ witness: witnesses, kycStatus: kycVerifications.status }).from(witnesses).leftJoin(kycVerifications, eq(witnesses.kycVerificationId, kycVerifications.id)).where(eq(witnesses.caseId, caseId)).orderBy(desc(witnesses.createdAt)),
    db.select({ consultant: consultants, kycStatus: kycVerifications.status }).from(consultants).leftJoin(kycVerifications, eq(consultants.kycVerificationId, kycVerifications.id)).where(eq(consultants.caseId, caseId)).orderBy(desc(consultants.createdAt)),
    db.select().from(expertiseRequests).where(eq(expertiseRequests.caseId, caseId)).orderBy(desc(expertiseRequests.createdAt)),
    db.select().from(caseMessages).where(eq(caseMessages.caseId, caseId)).orderBy(desc(caseMessages.createdAt)).limit(20),
    user.email
      ? db
          .select()
          .from(lawyerConversations)
          .where(
            and(
              eq(lawyerConversations.caseId, caseId),
              eq(lawyerConversations.userEmail, user.email),
            ),
          )
          .orderBy(desc(lawyerConversations.updatedAt))
          .limit(1)
      : Promise.resolve([]),
    db.select().from(caseAudits).where(eq(caseAudits.caseId, caseId)).orderBy(desc(caseAudits.createdAt)),
  ]);

  // Check if case has any hearings
  const hearingRows = await db.select().from(hearings).where(eq(hearings.caseId, caseId));
  const hasHearing = hearingRows.length > 0;

  // Calculate smart status and sync if needed
  const smartStatus = calculateSmartStatus(caseItem, hearingRows, activityRows);
  
  // Update case status if it's out of sync
  if (smartStatus !== caseItem.status) {
    await db.update(cases).set({ status: smartStatus }).where(eq(cases.id, caseId));
    caseItem.status = smartStatus; // Update local reference
  }

  const todoItems = [
    !caseItem.claimantLawyerKey ? { key: "claimant-lawyer", label: "Claimant must choose a lawyer" } : null,
    !caseItem.respondentLawyerKey && caseItem.respondentEmail ? { key: "respondent-lawyer", label: "Respondent must choose a lawyer" } : null,
    caseItem.status === "draft" ? { key: "file-case", label: "File the case to start the workflow" } : null,
    evidenceRows.length === 0 ? { key: "add-evidence", label: "Add initial evidence" } : null,
    witnessRows.length === 0 ? { key: "add-witness", label: "Add witnesses if relevant" } : null,
    !activityRows.some((item) => item.title === "Defendant notified") && caseItem.status !== "draft"
      ? { key: "notify-respondent", label: "Notify the respondent" }
      : null,
    caseItem.status === "filed" && !hasHearing
      ? { key: "schedule-hearing", label: "Schedule a hearing or review" }
      : null,
  ].filter((item): item is { key: string; label: string } => item !== null);

  const progressStages = [
    { key: "filed", label: "Filed", active: caseItem.status !== "draft" },
    { key: "notified", label: "Respondent notified", active: activityRows.some((item) => item.title === "Defendant notified") },
    { key: "evidence", label: "Evidence gathering", active: evidenceRows.length > 0 },
    { key: "hearing", label: "Hearing scheduled", active: caseItem.status === "hearing_scheduled" || hasHearing },
    { key: "decision", label: "Decision phase", active: ["in_arbitration", "awaiting_decision", "resolved"].includes(caseItem.status) },
  ];

  // Flatten joined witness/consultant results to include kycStatus
  const flatWitnesses = witnessRows.map((row) => ({ ...row.witness, kycStatus: row.kycStatus }));
  const flatConsultants = consultantRows.map((row) => ({ ...row.consultant, kycStatus: row.kycStatus }));

  return {
    case: caseItem,
    role,
    roleLabel: toRoleLabel(role),
    activities: activityRows,
    evidence: evidenceRows,
    witnesses: flatWitnesses,
    consultants: flatConsultants,
    expertiseRequests: expertiseRows,
    messages: messageRows,
    conversation: conversations[0] ?? null,
    audits: auditRows,
    hearings: hearingRows,
    todoItems,
    progressStages,
    summaryCards: [
      { label: "Evidence", value: flatWitnesses.length },
      { label: "Witnesses", value: flatWitnesses.length },
      { label: "Consultants", value: flatConsultants.length },
      { label: "Expertise", value: expertiseRows.length },
    ],
  };
}
