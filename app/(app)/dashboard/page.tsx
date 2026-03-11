import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CheckCircle2, FileStack, Gavel, Plus, Timer } from "lucide-react";
import { ensureAppUser } from "@/server/auth/provision";
import { getDashboardData } from "@/server/cases/queries";
import { formatCurrency, formatDateTime } from "@/server/format";

const statCards = [
  {
    key: "totalCases",
    label: "Total cases",
    icon: FileStack,
  },
  {
    key: "activeCases",
    label: "Active",
    icon: Timer,
  },
  {
    key: "resolvedCases",
    label: "Resolved",
    icon: CheckCircle2,
  },
  {
    key: "urgentCases",
    label: "Needs attention",
    icon: AlertTriangle,
  },
] as const;

export default async function DashboardPage() {
  const appUser = await ensureAppUser();
  const data = await getDashboardData(appUser);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-500">Dashboard</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Case operations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            This is the first authenticated slice of the rewrite. It provisions the app user and
            reads cases directly from the Neon/Drizzle model instead of Base44.
          </p>
        </div>
        <Link
          href="/cases/new"
          className="inline-flex items-center gap-2 self-start rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          New case
        </Link>
      </div>

      {!data.databaseReady ? (
        <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          `DATABASE_URL` is not configured yet. The authenticated shell is working, but case reads
          will stay empty until Neon is connected and migrations are applied.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ key, label, icon: Icon }) => (
          <section key={key} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-600">{label}</div>
              <Icon className="h-5 w-5 text-slate-400" />
            </div>
            <div className="mt-4 text-3xl font-semibold tracking-tight text-ink">
              {data.stats[key]}
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-ink">Recent cases</h2>
            <Link href="/cases" className="text-sm font-medium text-signal hover:text-teal-800">
              View all
            </Link>
          </div>
          {data.recentCases.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
              No cases available yet for this account.
            </div>
          ) : (
            <div className="space-y-4">
              {data.recentCases.map((caseItem) => (
                <Link
                  key={caseItem.id}
                  href={`/cases/${caseItem.id}` as Route}
                  className="block rounded-[24px] border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        {caseItem.caseNumber}
                      </div>
                      <h3 className="text-lg font-semibold text-ink">{caseItem.title}</h3>
                      <div className="text-sm text-slate-600">
                        {caseItem.claimantName || "Unknown claimant"} vs{" "}
                        {caseItem.respondentName || "Unknown respondent"}
                      </div>
                    </div>
                    <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      {caseItem.status.replaceAll("_", " ")}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-500">
                    <span>{caseItem.roleLabel}</span>
                    <span>{formatCurrency(caseItem.claimAmount, caseItem.currency)}</span>
                    <span>{formatDateTime(caseItem.updatedAt)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[28px] bg-ink p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <Gavel className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Activity</div>
              <h2 className="text-xl font-semibold">Recent case events</h2>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {data.activities.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                No activity recorded yet.
              </div>
            ) : (
              data.activities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
                >
                  <div className="font-semibold text-white">{activity.title}</div>
                  <div className="mt-1 text-slate-300">{activity.caseTitle}</div>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs uppercase tracking-[0.15em] text-slate-400">
                    <span>{activity.type.replaceAll("_", " ")}</span>
                    <span>{formatDateTime(activity.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
