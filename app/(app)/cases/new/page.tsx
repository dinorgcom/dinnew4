import { CaseCreationWizard } from "@/components/case-creation-wizard";
import { ensureAppUser } from "@/server/auth/provision";
import { getVerificationStatus } from "@/server/identity/service";

export default async function NewCasePage() {
  const user = await ensureAppUser();

  // If KYC is complete the verified name comes from Stripe Identity and is
  // locked. Otherwise we let the user type their own name in the wizard.
  let filerName = user?.fullName ?? "";
  let filerNameLocked = false;
  if (user?.id && user.kycVerified) {
    const status = await getVerificationStatus(user.id);
    if ("verifiedFirstName" in status) {
      const verified = `${status.verifiedFirstName ?? ""} ${status.verifiedLastName ?? ""}`.trim();
      if (verified) {
        filerName = verified;
        filerNameLocked = true;
      }
    }
  }

  return (
    <CaseCreationWizard
      kycVerified={user?.kycVerified ?? false}
      filerName={filerName}
      filerEmail={user?.email ?? ""}
      filerNameLocked={filerNameLocked}
    />
  );
}
