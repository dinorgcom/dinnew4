import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { consultants, kycVerifications } from "@/db/schema";
import { InviteeVerifyStatus } from "@/components/invitee-verify-status";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function ConsultantVerifyResultPage({ params }: PageProps) {
  const { token } = await params;
  const db = getDb();

  const rows = await db
    .select({
      id: consultants.id,
      kycVerificationId: consultants.kycVerificationId,
    })
    .from(consultants)
    .where(eq(consultants.invitationToken, token))
    .limit(1);

  const consultant = rows[0];
  if (!consultant) {
    notFound();
  }

  let initialStatus = "not_started";
  if (consultant.kycVerificationId) {
    const kycRows = await db
      .select({ status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, consultant.kycVerificationId))
      .limit(1);
    initialStatus = kycRows[0]?.status || "not_started";
  }

  return <InviteeVerifyStatus token={token} initialStatus={initialStatus} entityType="consultant" />;
}
