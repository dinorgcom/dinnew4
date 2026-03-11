export default function NewCasePlaceholderPage() {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8">
      <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Phase 2</div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Create case workflow</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
        Case creation and mutation paths are intentionally deferred to Phase 2. Phase 1 only
        establishes auth provisioning plus read-only dashboard and case access on the new stack.
      </p>
    </div>
  );
}
