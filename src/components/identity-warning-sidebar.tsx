"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type Props = {
  kycVerified: boolean;
};

export function IdentityWarningSidebar({ kycVerified }: Props) {
  const pathname = usePathname() || "/dashboard";

  if (kycVerified) {
    return null;
  }

  const returnTo = encodeURIComponent(pathname);
  const href = `/verify/start?returnTo=${returnTo}` as Route;

  return (
    <div className="mt-auto rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-100">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
        <div>
          <p className="font-semibold">Identity not verified</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Verification is required to join hearings.
          </p>
        </div>
      </div>
      <Link
        href={href}
        className="mt-3 block w-full rounded-full bg-white px-3 py-2 text-center text-xs font-semibold text-amber-900 transition hover:bg-amber-50"
      >
        Verify now
      </Link>
    </div>
  );
}
