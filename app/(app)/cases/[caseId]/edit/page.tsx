import { notFound } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { CaseEditor } from "@/components/case-editor";
import { getVerificationStatus } from "@/server/identity/service";

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

  let claimantPrefill: { name: string; locked: boolean } | null = null;
  if (appUser?.id && appUser.kycVerified) {
    const status = await getVerificationStatus(appUser.id);
    if ("verifiedFirstName" in status) {
      const name = `${status.verifiedFirstName ?? ""} ${status.verifiedLastName ?? ""}`.trim();
      if (name) {
        claimantPrefill = { name, locked: true };
      }
    }
  }

  return (
    <CaseEditor
      mode="edit"
      initialCase={detail.case}
      kycVerified={appUser?.kycVerified ?? false}
      claimantPrefill={claimantPrefill}
    />
  );
}
