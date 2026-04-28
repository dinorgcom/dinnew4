import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { ensureAppUser } from "@/server/auth/provision";
import { getTokenBalance } from "@/server/billing/service";
import { getCaseList } from "@/server/cases/queries";
import { isDatabaseConfigured } from "@/server/runtime";
import { AppShellNav } from "@/components/app-shell-nav";
import { IdentityWarningSidebar } from "@/components/identity-warning-sidebar";
import { AdminViewToggle } from "@/components/admin-view-toggle";
import { readImpersonationCookie } from "@/server/auth/impersonation";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const appUser = await ensureAppUser();
  const balance = appUser?.id && isDatabaseConfigured() ? await getTokenBalance(appUser.id) : 0;

  const caseList = appUser?.id && isDatabaseConfigured() ? await getCaseList(appUser) : null;
  const userCases = (caseList?.cases ?? []).filter(
    (c) => c.role === "claimant" || c.role === "respondent",
  );
  const claimantCount = userCases.filter((c) => c.role === "claimant").length;
  const respondentCount = userCases.filter((c) => c.role === "respondent").length;
  const caseSummary = {
    total: userCases.length,
    claimantCount,
    respondentCount,
    singleCase:
      userCases.length === 1
        ? { id: userCases[0].id, title: userCases[0].title }
        : null,
  };

  const isAdmin = appUser?.role === "admin";
  const impersonationCookie = isAdmin ? await readImpersonationCookie() : null;

  return (
    <div className="min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="sticky top-0 z-10 flex h-screen flex-col overflow-y-auto bg-ink p-4 text-white shadow-[0_24px_60px_rgba(17,24,39,0.24)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-white">
                DIN.ORG
              </Link>
              <p className="mt-1 text-sm text-slate-300">Arbitration workspace</p>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>

          <AdminViewToggle isAdmin={isAdmin} impersonation={impersonationCookie} />

          <div className="mt-8 rounded-md border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Account</div>
            <div className="mt-3 text-sm font-semibold text-white">
              {appUser?.fullName || appUser?.email || "Provisioning pending"}
            </div>
            <div className="mt-1 text-sm text-slate-300">{appUser?.role ?? "user"}</div>
            <div className="mt-4 rounded-md bg-white/10 px-3 py-2 text-sm text-slate-100">
              Token balance: {balance}
            </div>
          </div>

          <AppShellNav role={appUser?.role ?? "user"} caseSummary={caseSummary} />

          <IdentityWarningSidebar kycVerified={Boolean(appUser?.kycVerified)} />
        </aside>

        <div className="min-w-0 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
