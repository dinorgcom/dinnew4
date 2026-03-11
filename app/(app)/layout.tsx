import Link from "next/link";
import type { ReactNode } from "react";
import { UserButton } from "@clerk/nextjs";
import { ensureAppUser } from "@/server/auth/provision";
import { AppShellNav } from "@/components/app-shell-nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const appUser = await ensureAppUser();

  return (
    <div className="min-h-screen bg-[#f6f4ef]">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="rounded-[28px] bg-ink p-5 text-white shadow-[0_24px_60px_rgba(17,24,39,0.24)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href="/dashboard" className="text-xl font-semibold tracking-tight text-white">
                DIN.ORG
              </Link>
              <p className="mt-1 text-sm text-slate-300">Vercel rewrite workspace</p>
            </div>
            <UserButton afterSignOutUrl="/" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Account</div>
            <div className="mt-3 text-sm font-semibold text-white">
              {appUser?.fullName || appUser?.email || "Provisioning pending"}
            </div>
            <div className="mt-1 text-sm text-slate-300">{appUser?.role ?? "user"}</div>
          </div>

          <AppShellNav role={appUser?.role ?? "user"} />
        </aside>

        <div className="min-w-0 rounded-[28px] border border-black/5 bg-white/85 p-6 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  );
}
