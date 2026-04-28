"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items: { href: Route; label: string }[] = [
  { href: "/admin/users" as Route, label: "Users" },
  { href: "/admin/tokens" as Route, label: "Tokens" },
  { href: "/admin/logs" as Route, label: "Logs" },
];

export function AdminSectionNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="space-y-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-4 py-2.5 text-sm font-medium transition",
              active
                ? "bg-white text-ink shadow"
                : "text-slate-300 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
