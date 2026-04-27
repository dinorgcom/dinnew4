import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { ensureAppUser } from "@/server/auth/provision";
import { getTokenBalance } from "@/server/billing/service";
import { getCaseList } from "@/server/cases/queries";
import { isDatabaseConfigured } from "@/server/runtime";
import { AppShellNav } from "@/components/app-shell-nav";

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

  return (
    <div className="min-h-screen bg-[color:var(--bg-canvas)]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] bg-ink p-5 text-white shadow-[0_24px_60px_rgba(17,24,39,0.24)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-white">
                DIN.ORG
              </Link>
              <p className="mt-1 text-sm text-slate-300">Arbitration workspace</p>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Account</div>
            <div className="mt-3 text-sm font-semibold text-white">
              {appUser?.fullName || appUser?.email || "Provisioning pending"}
            </div>
            <div className="mt-1 text-sm text-slate-300">{appUser?.role ?? "user"}</div>
            <div className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-100">
              Token balance: {balance}
            </div>
          </div>

          <AppShellNav role={appUser?.role ?? "user"} caseSummary={caseSummary} />
        </aside>

        <div className="min-w-0 rounded-[28px] border border-black/5 bg-white/88 p-6 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  );
}
