"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

type Props = {
  kycVerified: boolean;
};

export function IdentityWarningSidebar({ kycVerified }: Props) {
  const pathname = usePathname() || "/dashboard";

  return (
    <div className="mt-auto space-y-3">
      <Link
        href={"/terms" as Route}
        className="block rounded-md border border-white/10 bg-white/5 px-4 py-2.5 text-center text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
      >
        Terms &amp; conditions
      </Link>
      {!kycVerified ? (
        <div className="rounded-md border border-orange-400/60 bg-orange-500/30 p-4 text-sm text-orange-50">
          <div className="flex items-start gap-2">
            <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="font-semibold">Identity not verified</p>
              <p className="mt-1 text-xs text-orange-100/90">
                Verification is required to join hearings.
              </p>
            </div>
          </div>
          <Link
            href={`/verify/start?returnTo=${encodeURIComponent(pathname)}` as Route}
            className="mt-3 block w-full rounded-md bg-white px-3 py-2 text-center text-xs font-semibold text-orange-700 transition hover:bg-orange-50"
          >
            Verify now
          </Link>
        </div>
      ) : null}
    </div>
  );
}
