"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Coins, FolderOpen, LayoutDashboard, PencilRuler, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: Route;
  label: string;
  icon: typeof LayoutDashboard;
};

const claimantItem: NavItem = { href: "/claimant" as Route, label: "Claimant", icon: LayoutDashboard };
const respondentItem: NavItem = { href: "/respondent" as Route, label: "Respondent", icon: LayoutDashboard };
const casesItem: NavItem = { href: "/cases" as Route, label: "Cases", icon: FolderOpen };
const newCaseItem: NavItem = { href: "/cases/new" as Route, label: "New case", icon: PencilRuler };
const billingItem: NavItem = { href: "/billing" as Route, label: "Buy tokens", icon: Coins };

type CaseSummary = {
  total: number;
  claimantCount: number;
  respondentCount: number;
  singleCase: { id: string; title: string } | null;
};

type AppShellNavProps = {
  role: string;
  caseSummary?: CaseSummary;
};

function buildItems(role: string, summary?: CaseSummary): NavItem[] {
  const isPrivilegedRole = role === "admin" || role === "moderator";
  if (isPrivilegedRole || !summary) {
    return [claimantItem, respondentItem, casesItem, newCaseItem, billingItem];
  }

  if (summary.singleCase) {
    return [
      {
        href: `/cases/${summary.singleCase.id}` as Route,
        label: summary.singleCase.title || "My case",
        icon: FolderOpen,
      },
      newCaseItem,
      billingItem,
    ];
  }

  const items: NavItem[] = [];
  const showClaimant = summary.claimantCount > 0 || summary.total === 0;
  const showRespondent = summary.respondentCount > 0 || summary.total === 0;
  if (showClaimant) items.push(claimantItem);
  if (showRespondent) items.push(respondentItem);
  items.push(casesItem, newCaseItem, billingItem);
  return items;
}

export function AppShellNav({ role, caseSummary }: AppShellNavProps) {
  const pathname = usePathname();
  const items = buildItems(role, caseSummary);

  return (
    <nav className="mt-8 space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href
          || (item.href === "/cases" && pathname.startsWith("/cases/") && pathname !== "/cases/new")
          || (item.href.startsWith("/cases/") && pathname === item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
              active ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      <div className="pt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Current role</div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
        {role}
      </div>

      {role === "admin" ? (
        <>
          <Link
            href={"/admin/users" as Route}
            className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Shield className="h-4 w-4" />
            <span>Admin users</span>
          </Link>
          <Link
            href={"/admin/tokens" as Route}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Shield className="h-4 w-4" />
            <span>Admin tokens</span>
          </Link>
          <Link
            href={"/admin/logs" as Route}
            className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Shield className="h-4 w-4" />
            <span>Admin logs</span>
          </Link>
        </>
      ) : null}
    </nav>
  );
}
