import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consultants, cases, kycVerifications } from "@/db/schema";
import { ConsultantVerifyPage } from "@/components/consultant-verify-page";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ConsultantVerificationPage({ params }: PageProps) {
  const { token } = await params;
  const db = getDb();

  const rows = await db
    .select()
    .from(consultants)
    .where(eq(consultants.invitationToken, token))
    .limit(1);

  const consultant = rows[0];
  if (!consultant) {
    notFound();
  }

  // Check if already verified (takes priority over expiry — a verified
  // consultant shouldn't see "Link Expired" just because 7 days passed).
  if (consultant.kycVerificationId) {
    const kycRows = await db
      .select({ status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, consultant.kycVerificationId))
      .limit(1);

    if (kycRows[0]?.status === "verified") {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
          <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Already Verified</h1>
              <p className="text-sm text-slate-500">
                Your identity has already been verified. You may close this page.
              </p>
            </div>
          </div>
        </div>
      );
    }
  }

  // Check if link expired
  if (consultant.invitationTokenExpiresAt && consultant.invitationTokenExpiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
        <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Link Expired</h1>
            <p className="text-sm text-slate-500">
              This invitation link has expired. Please contact the party who invited you to request a new link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Resolve who called the consultant
  const caseRows = await db
    .select({ claimantName: cases.claimantName, respondentName: cases.respondentName })
    .from(cases)
    .where(eq(cases.id, consultant.caseId))
    .limit(1);

  const caseItem = caseRows[0];
  const calledByPartyName =
    consultant.calledBy === "claimant"
      ? caseItem?.claimantName || "the claimant"
      : consultant.calledBy === "respondent"
        ? caseItem?.respondentName || "the respondent"
        : "the arbitrator";

  return (
    <ConsultantVerifyPage
      consultantName={consultant.fullName}
      calledByPartyName={calledByPartyName}
      report={consultant.report}
      reportFileUrl={consultant.reportFileUrl}
      token={token}
    />
  );
}
