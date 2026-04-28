"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type Props = {
  kycVerified: boolean;
};

// Compact warning pill placed near the top of the sidebar.
export function IdentityBadge({ kycVerified }: Props) {
  const pathname = usePathname() || "/dashboard";
  if (kycVerified) return null;
  return (
    <Link
      href={`/verify/start?returnTo=${encodeURIComponent(pathname)}` as Route}
      className="mt-3 flex items-center justify-between gap-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600"
    >
      <span className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        Verify identity
      </span>
      <span aria-hidden="true">→</span>
    </Link>
  );
}

// Slim Terms link anchored to the bottom of the sidebar via mt-auto.
export function TermsLinkSidebar() {
  return (
    <Link
      href={"/terms" as Route}
      className="mt-auto block rounded-md border border-white/10 bg-white/5 px-4 py-2 text-center text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
    >
      Terms &amp; conditions
    </Link>
  );
}

// Backwards-compat: the previous IdentityWarningSidebar rendered both at the
// bottom. Keep the export so any stale imports keep working, but render
// nothing — layout.tsx now uses IdentityBadge / TermsLinkSidebar directly.
export function IdentityWarningSidebar(_props: Props) {
  return null;
}
