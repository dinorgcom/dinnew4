"use client";

import { useState, useTransition } from "react";

type VerifyStartProps = {
  returnTo: string | null;
};

export function VerifyStart({ returnTo }: VerifyStartProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/identity/create-session", { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error?.message || "Failed to start verification.");
        return;
      }

      if (result.data.alreadyVerified) {
        window.location.href = returnTo || "/dashboard";
        return;
      }

      // Store returnTo so the result page knows where to redirect
      if (returnTo) {
        localStorage.setItem("kyc_return_to", returnTo);
      }

      window.location.href = result.data.url;
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
      <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-7 w-7 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Identity Verification Required
          </h1>
          <p className="text-sm leading-6 text-slate-500">
            To ensure the security and integrity of our arbitration platform,
            we require identity verification before you can proceed. You will be
            redirected to our secure verification partner to complete this process.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">What you will need</p>
          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-400">1.</span>
              A valid government-issued photo ID
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-slate-400">2.</span>
              A device with a camera for a selfie verification
            </li>
          </ul>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isPending}
          onClick={handleStart}
          className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Starting verification..." : "Start Verification"}
        </button>

        <p className="text-center text-xs text-slate-400">
          Verification is powered by Stripe Identity. Your data is handled securely.
        </p>
      </div>
    </div>
  );
}
