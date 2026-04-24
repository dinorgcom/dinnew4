"use client";

import { useEffect, useRef, useState, useTransition } from "react";

type InviteeVerifyStatusProps = {
  token: string;
  initialStatus: string;
  entityType: "witness" | "consultant";
};

export function InviteeVerifyStatus({ token, initialStatus, entityType }: InviteeVerifyStatusProps) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const statusEndpoint = entityType === "witness"
    ? `/api/public/witness-verify/status?token=${token}`
    : `/api/public/consultant-verify/status?token=${token}`;

  const verifyEndpoint = entityType === "witness"
    ? "/api/public/witness-verify"
    : "/api/public/consultant-verify";

  useEffect(() => {
    if (status !== "pending") {
      return;
    }

    intervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(statusEndpoint);
        const result = await response.json();
        const newStatus = result.status;

        if (newStatus && newStatus !== "pending") {
          setStatus(newStatus);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      } catch {
        // Silently retry on next interval
      }
    }, 4000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status, statusEndpoint]);

  function handleRetry() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(verifyEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to restart verification.");
        return;
      }

      if (result.alreadyVerified) {
        setStatus("verified");
        return;
      }

      window.location.href = result.url;
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
      <div className="w-full max-w-md space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        {status === "verified" ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Identity Verified</h1>
            <p className="text-sm text-slate-500">
              Thank you — your identity has been verified. You may close this page.
            </p>
          </div>
        ) : status === "pending" ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-7 w-7 animate-spin text-amber-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Verifying your identity...</h1>
            <p className="text-sm text-slate-500">
              We are processing your verification. This usually takes a few moments.
            </p>
          </div>
        ) : status === "requires_input" ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
              <svg className="h-7 w-7 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Verification Incomplete</h1>
            <p className="text-sm text-slate-500">
              We could not verify your identity. This may be due to an unclear photo or an unsupported document.
              Please try again.
            </p>
          </div>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <svg className="h-7 w-7 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">Verification Canceled</h1>
            <p className="text-sm text-slate-500">
              The verification was canceled. You can try again to complete the process.
            </p>
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {(status === "requires_input" || status === "canceled") ? (
          <button
            type="button"
            disabled={isPending}
            onClick={handleRetry}
            className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? "Starting..." : "Try Again"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
