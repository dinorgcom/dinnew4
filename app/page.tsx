const tracks = [
  "Platform scaffold on Next.js App Router",
  "Neon + Drizzle schema foundation",
  "Clerk identity boundary",
  "Vercel Blob storage boundary",
  "Vercel AI SDK abstraction layer",
];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl rounded-[32px] border border-black/5 bg-white/80 p-8 shadow-[0_24px_80px_rgba(17,24,39,0.08)] backdrop-blur">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-signal/20 bg-signal/10 px-3 py-1 text-sm font-semibold text-signal">
              Greenfield migration scaffold
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                DIN.ORG is being rebuilt off Base44 on a clean Vercel-native stack.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                This app is intentionally feature-light. It exists to establish the final platform,
                service boundaries, and schema foundation before any user-facing workflows are ported.
              </p>
            </div>
          </section>

          <aside className="rounded-[28px] bg-ink px-6 py-7 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Phase 0</div>
            <ul className="mt-5 space-y-4">
              {tracks.map((track) => (
                <li key={track} className="flex gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="text-sm leading-6 text-slate-200">{track}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </main>
  );
}
