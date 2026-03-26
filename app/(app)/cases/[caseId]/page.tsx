import { notFound, redirect } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { CaseDetailWorkspace } from "@/components/case-detail-workspace";

type CaseDetailPageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
  const appUser = await ensureAppUser();
  const detail = await getCaseDetail(appUser, caseId);

  if (!detail) {
    notFound();
  }

  if (detail.role === "respondent" && !detail.case.respondentLawyerKey) {
    redirect(`/cases/${caseId}/select-lawyer`);
  }

  return <CaseDetailWorkspace detail={detail} userRole={appUser?.role} />;
}
