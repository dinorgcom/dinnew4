import { notFound } from "next/navigation";
import { AdminUsersPage } from "@/components/admin-users-page";
import { ensureAppUser } from "@/server/auth/provision";
import { listAdminUsers } from "@/server/admin/service";
import { isDatabaseConfigured } from "@/server/runtime";

export default async function AdminUsersRoutePage() {
  const user = await ensureAppUser();
  if (!user || user.role !== "admin") {
    notFound();
  }

  const users = isDatabaseConfigured() ? await listAdminUsers(user) : [];

  return <AdminUsersPage users={users} />;
}
