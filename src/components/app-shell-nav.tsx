"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { FolderOpen, LayoutDashboard, PencilRuler } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard" as Route, label: "Dashboard", icon: LayoutDashboard },
  { href: "/cases" as Route, label: "Cases", icon: FolderOpen },
  { href: "/cases/new" as Route, label: "New case", icon: PencilRuler },
];

type AppShellNavProps = {
  role: string;
};

export function AppShellNav({ role }: AppShellNavProps) {
  const pathname = usePathname();

  return (
    <nav className="mt-8 space-y-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || (item.href === "/cases" && pathname.startsWith("/cases/"));

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
            <span>{item.label}</span>
          </Link>
        );
      })}

      <div className="pt-4 text-xs uppercase tracking-[0.18em] text-slate-500">Current role</div>
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
        {role}
      </div>
    </nav>
  );
}
