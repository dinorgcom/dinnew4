import { notFound, redirect } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { CaseDetailWorkspace } from "@/components/case-detail-workspace";
import { linkClaimantIfMatching, linkRespondentIfMatching } from "@/server/identity/service";

type CaseDetailPageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
  const appUser = await ensureAppUser();

  let detail = await getCaseDetail(appUser, caseId);

  if (!detail) {
    notFound();
  }

  // Opportunistic respondent linking: when the verified respondent views their
  // own case for the first time, auto-link the case to the verified user.
  if (
    appUser?.id &&
    appUser.kycVerified &&
    !detail.case.claimantKycVerificationId &&
    detail.role === "claimant"
  ) {
    try {
      const { linked } = await linkClaimantIfMatching(caseId, appUser.id);
      if (linked) {
        detail = (await getCaseDetail(appUser, caseId)) ?? detail;
      }
    } catch (err) {
      console.error("linkClaimantIfMatching (page) failed", err);
    }
  }

  if (
    appUser?.id &&
    appUser.kycVerified &&
    !detail.case.respondentUserId &&
    detail.role === "respondent"
  ) {
    try {
      const { linked } = await linkRespondentIfMatching(caseId, appUser.id);
      if (linked) {
        // Refresh detail so the banner reflects the new state.
        detail = (await getCaseDetail(appUser, caseId)) ?? detail;
      }
    } catch (err) {
      console.error("linkRespondentIfMatching (page) failed", err);
    }
  }

  if (detail.role === "respondent" && !detail.case.respondentLawyerKey) {
    redirect(`/cases/${caseId}/select-lawyer`);
  }

  return <CaseDetailWorkspace detail={detail} userRole={appUser?.role} user={appUser} />;
}
