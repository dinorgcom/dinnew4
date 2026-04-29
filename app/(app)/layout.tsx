import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { ensureAppUser } from "@/server/auth/provision";
import { getTokenBalance } from "@/server/billing/service";
import { getCaseList } from "@/server/cases/queries";
import { isDatabaseConfigured } from "@/server/runtime";
import { AppShellNav } from "@/components/app-shell-nav";
import { IdentityBadge, TermsLinkSidebar } from "@/components/identity-warning-sidebar";
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
      <div className="grid min-h-screen lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="sticky top-0 z-10 flex h-screen flex-col overflow-y-auto bg-ink p-4 text-white shadow-[0_24px_60px_rgba(17,24,39,0.24)]">
          <div className="flex items-start justify-between gap-4">
            <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-white">
              DIN.ORG
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>

          <div className="mt-6 min-h-[88px] rounded-md border border-white/10 bg-white/5 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Account</div>
            <div className="mt-1 truncate text-sm font-semibold text-white">
              {appUser?.fullName || appUser?.email || "Provisioning pending"}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
              <span>Tokens</span>
              <span className="text-base font-bold text-white">{balance}</span>
            </div>
          </div>

          <AdminViewToggle isAdmin={isAdmin} impersonation={impersonationCookie} />

          <IdentityBadge kycVerified={Boolean(appUser?.kycVerified)} />

          <AppShellNav role={appUser?.role ?? "user"} caseSummary={caseSummary} />

          <TermsLinkSidebar />
        </aside>

        <div className="min-w-0 p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
