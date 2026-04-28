"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: Route;
  label: string;
};

const casesItem: NavItem = { href: "/cases" as Route, label: "Cases" };
const newCaseItem: NavItem = { href: "/cases/new" as Route, label: "New case" };
const billingItem: NavItem = { href: "/billing" as Route, label: "Buy tokens" };
const settingsItem: NavItem = { href: "/settings" as Route, label: "Settings" };

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

function buildItems(_role: string, summary?: CaseSummary): NavItem[] {
  if (summary?.singleCase) {
    return [
      {
        href: `/cases/${summary.singleCase.id}` as Route,
        label: summary.singleCase.title || "My case",
      },
      newCaseItem,
      billingItem,
      settingsItem,
    ];
  }
  return [casesItem, newCaseItem, billingItem, settingsItem];
}

export function AppShellNav({ role, caseSummary }: AppShellNavProps) {
  const pathname = usePathname();
  const items = buildItems(role, caseSummary);

  return (
    <nav className="mt-6 space-y-2">
      {items.map((item) => {
        const active =
          pathname === item.href
          || (item.href === "/cases" && pathname.startsWith("/cases/") && pathname !== "/cases/new")
          || (item.href.startsWith("/cases/") && pathname === item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-4 py-3 text-sm font-medium transition",
              active ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      {role === "admin" ? (
        <Link
          href={"/admin" as Route}
          className="mt-1 block rounded-md px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          Internal
        </Link>
      ) : null}
    </nav>
  );
}
