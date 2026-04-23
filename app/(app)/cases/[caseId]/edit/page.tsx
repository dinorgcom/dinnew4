import { notFound } from "next/navigation";
import { ensureAppUser } from "../../../../../src/server/auth/provision";
import { getCaseDetail } from "../../../../../src/server/cases/queries";
import { CaseEditor } from "../../../../../src/components/case-editor";

type EditCasePageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function EditCasePage({ params }: EditCasePageProps) {
  const { caseId } = await params;
  const appUser = await ensureAppUser();

  const detail = await getCaseDetail(appUser, caseId);

  if (!detail) {
    notFound();
  }

  return <CaseEditor mode="edit" initialCase={detail.case} />;
}
