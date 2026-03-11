import { notFound } from "next/navigation";
import { AdminTokenPage } from "@/components/admin-token-page";
import { ensureAppUser } from "@/server/auth/provision";
import { listUsersWithBalances } from "@/server/billing/service";
import { isDatabaseConfigured } from "@/server/runtime";

export default async function AdminTokensPage() {
  const user = await ensureAppUser();
  if (!user || user.role !== "admin") {
    notFound();
  }

  const users = isDatabaseConfigured() ? await listUsersWithBalances(user) : [];

  return <AdminTokenPage users={users} />;
}
