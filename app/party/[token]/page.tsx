import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { caseParties, cases } from "@/db/schema";
import { PartyAcceptPage } from "@/components/party-accept-page";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PartyInvitationPage({ params }: PageProps) {
  const { token } = await params;
  const db = getDb();

  const rows = await db
    .select()
    .from(caseParties)
    .where(eq(caseParties.invitationToken, token))
    .limit(1);

  const party = rows[0];
  if (!party) {
    notFound();
  }

  if (party.status === "active") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
        <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Already joined</h1>
            <p className="text-sm text-slate-500">
              You have already accepted this invitation. You can close this page and open the case from your dashboard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (party.status === "declined") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
        <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Invitation declined</h1>
            <p className="text-sm text-slate-500">
              This invitation was declined. If this was a mistake, contact the party who invited you to request a new invitation.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (
    party.invitationTokenExpiresAt &&
    party.invitationTokenExpiresAt < new Date()
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
        <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          <div className="space-y-4 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Link expired</h1>
            <p className="text-sm text-slate-500">
              This invitation link has expired. Please contact the party who invited you to request a new link.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const caseRows = await db
    .select({ caseNumber: cases.caseNumber, title: cases.title })
    .from(cases)
    .where(eq(cases.id, party.caseId))
    .limit(1);

  const caseItem = caseRows[0];
  if (!caseItem) {
    notFound();
  }

  return (
    <PartyAcceptPage
      partyName={party.fullName}
      side={party.side}
      caseNumber={caseItem.caseNumber}
      caseTitle={caseItem.title}
      token={token}
      pendingApproval={party.status === "pending_approval"}
    />
  );
}
