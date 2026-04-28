"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const CASE_DETAIL_RE = /^\/cases\/([^\/]+)(?:\/.*)?$/;
function getActiveCaseId(pathname: string | null): string | null {
  if (!pathname) return null;
  const match = pathname.match(CASE_DETAIL_RE);
  if (!match) return null;
  const id = match[1];
  if (id === "new") return null;
  return id;
}

type NavItem = {
  href: Route;
  label: string;
};

const claimantItem: NavItem = { href: "/claimant" as Route, label: "Claimant" };
const respondentItem: NavItem = { href: "/respondent" as Route, label: "Respondent" };
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

function buildItems(role: string, summary?: CaseSummary): NavItem[] {
  const isPrivilegedRole = role === "admin" || role === "moderator";
  if (isPrivilegedRole || !summary) {
    return [claimantItem, respondentItem, casesItem, newCaseItem, billingItem, settingsItem];
  }

  if (summary.singleCase) {
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

  const items: NavItem[] = [];
  const showClaimant = summary.claimantCount > 0 || summary.total === 0;
  const showRespondent = summary.respondentCount > 0 || summary.total === 0;
  if (showClaimant) items.push(claimantItem);
  if (showRespondent) items.push(respondentItem);
  items.push(casesItem, newCaseItem, billingItem, settingsItem);
  return items;
}

export function AppShellNav({ role, caseSummary }: AppShellNavProps) {
  const pathname = usePathname();
  const items = buildItems(role, caseSummary);
  const activeCaseId = getActiveCaseId(pathname);
  const arbitrationHref = activeCaseId
    ? (`/cases/${activeCaseId}?tab=arbitration` as Route)
    : null;

  return (
    <nav className="mt-8 space-y-2">
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

      {arbitrationHref ? (
        <Link
          href={arbitrationHref}
          className="mt-1 block rounded-md border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/20"
        >
          Arbitration offer
        </Link>
      ) : null}

      {role === "admin" ? (
        <Link
          href={"/admin" as Route}
          className="mt-1 block rounded-md px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
        >
          Admin
        </Link>
      ) : null}
    </nav>
  );
}
