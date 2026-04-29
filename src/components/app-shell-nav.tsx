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

function buildItems(_role: string, _summary?: CaseSummary): NavItem[] {
  return [casesItem, newCaseItem, billingItem, settingsItem];
}

const CASE_DETAIL_RE = /^\/cases\/([^\/]+)(?:\/.*)?$/;
function getActiveCaseId(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(CASE_DETAIL_RE);
  if (!match) return null;
  const id = match[1];
  if (id === "new") return null;
  return id;
}

export function AppShellNav({ role, caseSummary }: AppShellNavProps) {
  const pathname = usePathname();
  const items = buildItems(role, caseSummary);
  const activeCaseId = getActiveCaseId(pathname);
  const settlementHref = activeCaseId
    ? (`/cases/${activeCaseId}?tab=settlement` as Route)
    : null;

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

      {settlementHref ? (
        <Link
          href={settlementHref}
          className="mt-3 block rounded-md border border-emerald-300/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/20"
        >
          Offer Settlement
        </Link>
      ) : null}
    </nav>
  );
}
