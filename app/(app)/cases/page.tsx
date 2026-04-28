import Link from "next/link";
import type { Route } from "next";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseList } from "@/server/cases/queries";
import { formatCurrency, formatDateTime } from "@/server/format";

type CasesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CasesPage({ searchParams }: CasesPageProps) {
  const params = (await searchParams) ?? {};
  const search = typeof params.search === "string" ? params.search : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const appUser = await ensureAppUser();
  const data = await getCaseList(appUser, { search, status });

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Cases</div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">All accessible cases</h1>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--ink-soft)]">
          Search the cases available to your role, then move directly into the full dispute workspace.
        </p>
      </div>

      <form className="grid gap-4 rounded-md border border-[color:var(--line-soft)] bg-[color:var(--bg-tint)]/35 p-5 md:grid-cols-[minmax(0,1fr)_220px_auto]">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search by case number, title, or party"
          className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
        />
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          Apply
        </button>
      </form>

      {data.cases.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
          No cases matched the current filters.
        </div>
      ) : (
        <div className="space-y-4">
          {data.cases.map((caseItem) => (
            <Link
              key={caseItem.id}
              href={`/cases/${caseItem.id}` as Route}
              className="grid gap-4 rounded-md border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.5fr)_minmax(180px,0.5fr)]"
            >
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  {caseItem.caseNumber}
                </div>
                <div className="text-lg font-semibold text-ink">{caseItem.title}</div>
                <div className="text-sm text-slate-600">
                  {caseItem.claimantName || "Unknown claimant"} vs{" "}
                  {caseItem.respondentName || "Unknown respondent"}
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div>
                  <span className="font-semibold text-slate-900">Status:</span>{" "}
                  {caseItem.status.replaceAll("_", " ")}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Role:</span> {caseItem.roleLabel}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Priority:</span>{" "}
                  {caseItem.priority}
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div>
                  <span className="font-semibold text-slate-900">Amount:</span>{" "}
                  {formatCurrency(caseItem.claimAmount, caseItem.currency)}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Updated:</span>{" "}
                  {formatDateTime(caseItem.updatedAt)}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
