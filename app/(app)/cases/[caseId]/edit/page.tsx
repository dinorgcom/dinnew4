import { notFound } from "next/navigation";
import { ensureAppUser } from "../../../../../src/server/auth/provision";
import { getCaseDetail } from "../../../../../src/server/cases/queries";
import { getDb } from "../../../../../src/db/client";
import { cases, lawyerConversations, caseActivities } from "../../../../../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { CaseEditor } from "../../../../../src/components/case-editor";

type EditCasePageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function EditCasePage({ params }: EditCasePageProps) {
  const { caseId } = await params;
  const appUser = await ensureAppUser();
  
  // Check if user is admin/moderator for fallback access
  const isAdminOrModerator = appUser?.role === "admin" || appUser?.role === "moderator";
  
  let detail = await getCaseDetail(appUser, caseId);
  
  if (!detail && isAdminOrModerator) {
    // Admin/moderator fallback: get basic case info directly
    const db = getDb();
    const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
    const caseItem = caseRows[0];
    
    if (!caseItem) {
      notFound();
    }
    
    // Get actual conversation data for admin access
    const conversationRows = await db.select().from(lawyerConversations).where(eq(lawyerConversations.caseId, caseId));
    
    // Check if respondent has been notified
    const notificationCheck = await db
      .select({ count: sql<number>`count(*)` })
      .from(caseActivities)
      .where(and(
        eq(caseActivities.caseId, caseId),
        eq(caseActivities.title, "Defendant notified")
      ));
    const respondentNotified = notificationCheck[0]?.count > 0;
        
    // Create minimal detail object for admin access
    detail = {
      case: caseItem,
      role: appUser.role as 'admin' | 'moderator',
      roleLabel: appUser.role === 'admin' ? 'Admin' : 'Moderator',
      evidence: [],
      witnesses: [],
      consultants: [],
      activities: [],
      expertiseRequests: [],
      messages: [],
      conversation: conversationRows[0] ?? null,
      hearings: [],
      audits: [],
      todoItems: [],
      respondentNotified,
      progressStages: [],
      summaryCards: [],
    };
  }

  if (!detail) {
    notFound();
  }

  return <CaseEditor mode="edit" initialCase={detail.case} />;
}
