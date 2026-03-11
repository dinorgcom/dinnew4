import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Not found</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">This record does not exist</h1>
        <p className="mt-3 text-sm text-slate-600">The requested route or case could not be found.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
