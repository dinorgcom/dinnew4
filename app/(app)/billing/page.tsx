import { ensureAppUser } from "@/server/auth/provision";
import { getPricing, getTokenBalance } from "@/server/billing/service";
import { isDatabaseConfigured } from "@/server/runtime";
import { BillingPage } from "@/components/billing-page";

export default async function BillingRoutePage() {
  const user = await ensureAppUser();
  const pricing = getPricing();
  const balance = user?.id && isDatabaseConfigured() ? await getTokenBalance(user.id) : 0;

  return <BillingPage pricing={{ ...pricing, balance }} />;
}
