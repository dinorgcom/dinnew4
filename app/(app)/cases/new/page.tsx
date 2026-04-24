import { CaseEditor } from "@/components/case-editor";
import { ensureAppUser } from "@/server/auth/provision";
import { getVerificationStatus } from "@/server/identity/service";

export default async function NewCasePage() {
  const user = await ensureAppUser();
  let claimantPrefill: { name: string; locked: boolean } | null = null;
  if (user?.id && user.kycVerified) {
    const status = await getVerificationStatus(user.id);
    if ("verifiedFirstName" in status) {
      const name = `${status.verifiedFirstName ?? ""} ${status.verifiedLastName ?? ""}`.trim();
      if (name) {
        claimantPrefill = { name, locked: true };
      }
    }
  }
  return (
    <CaseEditor
      mode="create"
      kycVerified={user?.kycVerified ?? false}
      claimantPrefill={claimantPrefill}
    />
  );
}
