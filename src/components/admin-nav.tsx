"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin/users" as Route, label: "Users" },
  { href: "/admin/tokens" as Route, label: "Tokens" },
  { href: "/admin/logs" as Route, label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-4 py-2 text-sm font-medium transition",
            pathname === item.href
              ? "bg-ink text-white"
              : "border border-slate-300 text-slate-700 hover:border-slate-400",
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
