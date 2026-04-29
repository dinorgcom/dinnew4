"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type CaseAiNavProps = {
  caseId: string;
};

const items = [
  { href: "audit", label: "Summary" },
  { href: "arbitration", label: "Arbitration" },
  { href: "hearing", label: "Hearing" },
  { href: "judgement", label: "Judgement" },
  { href: "lawyer-chat", label: "Lawyer chat" },
] as const;

export function CaseAiNav({ caseId }: CaseAiNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const href = `/cases/${caseId}/${item.href}` as Route;
        const active = pathname === href;

        return (
          <Link
            key={item.href}
            href={href}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition",
              active ? "bg-ink text-white" : "border border-slate-300 text-slate-700 hover:border-slate-400",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
