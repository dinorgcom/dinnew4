import { notFound } from "next/navigation";
import { AdminLogsPage } from "@/components/admin-logs-page";
import { ensureAppUser } from "@/server/auth/provision";
import { listAdminActions } from "@/server/admin/service";
import { isDatabaseConfigured } from "@/server/runtime";

export default async function AdminLogsRoutePage() {
  const user = await ensureAppUser();
  if (!user || user.role !== "admin") {
    notFound();
  }

  const logs = isDatabaseConfigured() ? await listAdminActions(user) : [];

  return <AdminLogsPage logs={logs} />;
}
