import { notFound } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { LawyerSelectScreen } from "@/components/lawyer-select-screen";

type PageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function SelectCaseLawyerPage({ params }: PageProps) {
  const { caseId } = await params;
  const user = await ensureAppUser();
  const detail = await getCaseDetail(user, caseId);

  if (!detail || (detail.role !== "claimant" && detail.role !== "respondent")) {
    notFound();
  }

  return <LawyerSelectScreen caseId={caseId} partyRole={detail.role} />;
}
