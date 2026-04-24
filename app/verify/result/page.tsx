import { redirect } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getVerificationStatus } from "@/server/identity/service";
import { VerifyStatusPoller } from "@/components/verify-status-poller";

export default async function VerifyResultPage() {
  const user = await ensureAppUser();
  if (!user) {
    redirect("/sign-in" as never);
  }

  const status = user.id ? await getVerificationStatus(user.id) : { status: "not_started" as const };

  return <VerifyStatusPoller initialStatus={status.status} />;
}
