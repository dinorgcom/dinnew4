import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ensureAppUser } from "@/server/auth/provision";
import { AdminSectionNav } from "@/components/admin-section-nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const user = await ensureAppUser();
  if (!user || user.role !== "admin") {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Admin</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          Workspace administration
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[color:var(--ink-soft)]">
          Manage users, token grants, and audit logs across the platform.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start rounded-md bg-ink p-4">
          <AdminSectionNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
