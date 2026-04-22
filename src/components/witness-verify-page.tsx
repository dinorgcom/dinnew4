"use client";

import { useState, useTransition } from "react";

type WitnessVerifyPageProps = {
  witnessName: string;
  calledByPartyName: string;
  statement: string | null;
  statementFileUrl: string | null;
  token: string;
};

export function WitnessVerifyPage({
  witnessName,
  calledByPartyName,
  statement,
  statementFileUrl,
  token,
}: WitnessVerifyPageProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/public/witness-verify", {
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
        window.location.href = `/witness/${token}/result`;
        return;
      }

      window.location.href = result.url;
    });
  }

  return (
    <div className="min-h-screen bg-[color:var(--bg-canvas)] px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-white shadow-[0_10px_30px_rgba(17,24,39,0.18)]">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
            </svg>
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.24em] text-slate-400">
            Witness Statement
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Confirm Your Witness Statement
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            Hello <span className="font-medium text-ink">{witnessName}</span>. You have been
            called as a witness by{" "}
            <span className="font-medium text-ink">{calledByPartyName}</span>. Please read the
            statement below carefully. By verifying your identity, you are confirming that this
            statement is accurate and was made by you.
          </p>
        </header>

        <div className="rounded-[32px] border border-black/5 bg-white/92 p-6 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur sm:p-10">
          {statement ? (
            <section className="mb-10">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Your Statement
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Called by {calledByPartyName}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-6 text-base leading-7 text-slate-800 whitespace-pre-wrap sm:p-8">
                {statement}
              </div>
            </section>
          ) : null}

          {statementFileUrl ? (
            <section className="mb-10">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Attached Document
              </h2>
              <a
                href={`/api/public/witness-verify/file?token=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 transition hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-md"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-ink group-hover:text-white">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">View attached document</p>
                    <p className="mt-0.5 text-xs text-slate-500">Opens in a new tab</p>
                  </div>
                </div>
                <svg className="h-5 w-5 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </a>
            </section>
          ) : null}

          <section className="mb-10 rounded-2xl border border-amber-200/80 bg-amber-50 p-6 sm:p-7">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
                  Legal Attestation
                </h3>
                <p className="mt-2 text-sm leading-6 text-amber-900">
                  Completing identity verification serves as your formal confirmation that the
                  statement above is accurate, truthful, and made by you in your own words. It
                  will be recorded as your signed witness statement in this arbitration case.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Before you begin, have ready
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Photo ID</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    Passport, driver&apos;s license, or government-issued ID
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">Camera</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">
                    A device with a camera for a short selfie match
                  </p>
                </div>
              </div>
            </div>
          </section>

          {error ? (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col items-center gap-3 border-t border-slate-200 pt-8">
            <button
              type="button"
              disabled={isPending}
              onClick={handleVerify}
              className="w-full max-w-sm rounded-full bg-ink px-6 py-4 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
            >
              {isPending ? "Starting verification..." : "Confirm Statement & Verify Identity"}
            </button>
            <p className="text-center text-xs text-slate-400">
              Verification is powered by Stripe Identity. Your data is handled securely.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
