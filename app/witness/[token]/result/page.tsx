import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { witnesses, kycVerifications } from "@/db/schema";
import { InviteeVerifyStatus } from "@/components/invitee-verify-status";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function WitnessVerifyResultPage({ params }: PageProps) {
  const { token } = await params;
  const db = getDb();

  const rows = await db
    .select({
      id: witnesses.id,
      kycVerificationId: witnesses.kycVerificationId,
    })
    .from(witnesses)
    .where(eq(witnesses.invitationToken, token))
    .limit(1);

  const witness = rows[0];
  if (!witness) {
    notFound();
  }

  let initialStatus = "not_started";
  if (witness.kycVerificationId) {
    const kycRows = await db
      .select({ status: kycVerifications.status })
      .from(kycVerifications)
      .where(eq(kycVerifications.id, witness.kycVerificationId))
      .limit(1);
    initialStatus = kycRows[0]?.status || "not_started";
  }

  return <InviteeVerifyStatus token={token} initialStatus={initialStatus} entityType="witness" />;
}
