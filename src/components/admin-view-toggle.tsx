"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

type Props = {
  isAdmin: boolean;
  impersonation: {
    caseId: string;
    role: "claimant" | "respondent";
  } | null;
};

const CASE_DETAIL_RE = /^\/cases\/([^\/]+)/;

export function AdminViewToggle({ isAdmin, impersonation }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!isAdmin) return null;

  const match = pathname?.match(CASE_DETAIL_RE);
  const caseId = match?.[1];
  if (!caseId || caseId === "new") return null;

  const activeRole =
    impersonation && impersonation.caseId === caseId ? impersonation.role : null;

  async function setRole(role: "claimant" | "respondent") {
    setError(null);
    if (activeRole === role) {
      // Toggle off
      const response = await fetch("/api/admin/impersonate", { method: "DELETE" });
      if (!response.ok) {
        setError("Failed to clear impersonation");
        return;
      }
      startTransition(() => router.refresh());
      return;
    }
    const response = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, role }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      setError(json?.error?.message ?? "Failed to set view");
      return;
    }
    startTransition(() => router.refresh());
  }

  function buttonClasses(role: "claimant" | "respondent") {
    const isActive = activeRole === role;
    return [
      "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition",
      isActive
        ? "bg-orange-500 text-white shadow"
        : "bg-white text-slate-800 hover:bg-slate-100",
      pending ? "opacity-60" : "",
    ].join(" ");
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Admin view</div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void setRole("claimant")}
          className={buttonClasses("claimant")}
        >
          Claimant view
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void setRole("respondent")}
          className={buttonClasses("respondent")}
        >
          Respondent view
        </button>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
