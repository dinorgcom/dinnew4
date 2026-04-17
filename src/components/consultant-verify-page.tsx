"use client";

import { useState, useTransition } from "react";

type ConsultantVerifyPageProps = {
  consultantName: string;
  calledByPartyName: string;
  report: string | null;
  reportFileUrl: string | null;
  token: string;
};

export function ConsultantVerifyPage({
  consultantName,
  calledByPartyName,
  report,
  reportFileUrl,
  token,
}: ConsultantVerifyPageProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/public/consultant-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Failed to start verification.");
        return;
      }

      if (result.alreadyVerified) {
        window.location.href = `/consultant/${token}/result`;
        return;
      }

      window.location.href = result.url;
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--bg-canvas)] px-4">
      <div className="w-full max-w-lg space-y-6 rounded-[28px] border border-black/5 bg-white/88 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <svg className="h-7 w-7 text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Consultant Verification
          </h1>
          <p className="text-sm leading-6 text-slate-500">
            Hello {consultantName}, you have been called as a consultant by{" "}
            <strong className="text-slate-700">{calledByPartyName}</strong>.
            Please review the report below and verify your identity.
          </p>
        </div>

        {report ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Your Report
            </p>
            <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {report}
            </div>
          </div>
        ) : null}

        {reportFileUrl ? (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Attached Document
            </p>
            <a
              href={reportFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-blue-600 hover:bg-slate-100 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              View attached document
            </a>
          </div>
        ) : null}

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
          onClick={handleVerify}
          className="w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Starting verification..." : "Verify My Identity"}
        </button>

        <p className="text-center text-xs text-slate-400">
          Verification is powered by Stripe Identity. Your data is handled securely.
        </p>
      </div>
    </div>
  );
}
