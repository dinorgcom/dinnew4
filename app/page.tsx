import { SignedIn, SignedOut, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { env } from "@/lib/env";

const tracks = [
  "Lawyer-guided filing and respondent onboarding",
  "Case workspace with evidence, witnesses, expertise, and activity",
  "Protected uploads and case-scoped file access",
  "AI workflows for audits, arbitration, judgement, and lawyer chat",
  "Neon-backed auth, billing, and admin controls",
];

export default function HomePage() {
  const hasClerk = Boolean(env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl rounded-[36px] border border-black/5 bg-white/85 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        <div className="grid gap-10 lg:grid-cols-[1.25fr_0.75fr]">
          <section className="space-y-8">
            <div className="inline-flex rounded-full border border-signal/20 bg-signal/10 px-3 py-1 text-sm font-semibold text-signal">
              Arbitration operating system
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-6xl">
                Run claimant and respondent workflows from one structured case record.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-[color:var(--ink-soft)]">
                DIN.ORG now handles lawyer-guided filing, respondent defense, document intake, and
                AI-assisted dispute workflows on the Vercel, Neon, and Clerk stack.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Claimant portal", "File cases with a selected lawyer and structured claim set."],
                ["Respondent portal", "Review claims, choose counsel, and build a defense record."],
                ["Case workspace", "Track evidence, expertise, hearings, and AI outputs in one place."],
              ].map(([title, description]) => (
                <div key={title} className="rounded-[28px] border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-5">
                  <div className="text-sm font-semibold text-ink">{title}</div>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--ink-soft)]">{description}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {hasClerk ? (
                <>
                  <SignedOut>
                    <SignInButton mode="modal">
                      <button className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800">
                        Sign in
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal">
                      <button className="rounded-full border border-[color:var(--line-soft)] bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 hover:text-slate-900">
                        Create account
                      </button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <Link
                      href="/dashboard"
                      className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
                    >
                      Open dashboard
                    </Link>
                  </SignedIn>
                </>
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to enable sign-in.
                </div>
              )}
            </div>
          </section>

          <aside className="rounded-[30px] bg-ink px-6 py-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Now in platform</div>
            <ul className="mt-5 space-y-4">
              {tracks.map((track) => (
                <li key={track} className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm leading-6 text-slate-200">{track}</span>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-[24px] bg-white/10 p-5">
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Testing status</div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Use this environment to validate parity workflows end to end before Stripe and production email rollout are finalized.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
