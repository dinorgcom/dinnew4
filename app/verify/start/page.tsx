import { redirect } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getVerificationStatus } from "@/server/identity/service";
import { VerifyStart } from "@/components/verify-start";

type PageProps = {
  searchParams: Promise<{ returnTo?: string; force?: string }>;
};

export default async function VerifyStartPage({ searchParams }: PageProps) {
  const user = await ensureAppUser();
  if (!user) {
    redirect("/sign-in" as never);
  }

  const { returnTo, force } = await searchParams;
  const forceNew = force === "1";

  if (user.id && !forceNew) {
    const status = await getVerificationStatus(user.id);
    if (status.status === "verified") {
      redirect((returnTo || "/dashboard") as never);
    }
  }

  return <VerifyStart returnTo={returnTo || null} forceNew={forceNew} />;
}
