import Link from "next/link";
import type { Route } from "next";
import { AlertTriangle, CheckCircle2, Coins, Plus, Scale, Shield, User } from "lucide-react";
import { formatDateTime } from "@/server/format";

type DashboardCase = {
  id: string;
  caseNumber: string;
  title: string;
  claimantName: string | null;
  respondentName: string | null;
  status: string;
  priority: string;
  updatedAt: string | Date;
};

type RoleDashboardProps = {
  role: "claimant" | "respondent";
  balance: number;
  data: {
    stats: { total: number; active: number; resolved: number; urgent: number };
    cases: DashboardCase[];
  };
};

const config = {
  claimant: {
    title: "Claimant portal",
    subtitle: "View and manage the claims you have filed.",
    icon: User,
    cta: "File new claim",
  },
  respondent: {
    title: "Respondent portal",
    subtitle: "View claims against you and prepare your defense.",
    icon: Shield,
    cta: "Review open cases",
  },
} as const;

export function RoleDashboard({ role, balance, data }: RoleDashboardProps) {
  const content = config[role];
  const Icon = content.icon;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{role}</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{content.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[color:var(--ink-soft)]">{content.subtitle}</p>
        </div>
        {role === "claimant" ? (
          <Link
            href="/cases/new"
            className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {content.cta}
          </Link>
        ) : null}
      </div>

      <section className={`rounded-md p-6 ${role === "claimant" ? "bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(15,118,110,0.82))] text-white" : "bg-[linear-gradient(135deg,rgba(17,24,39,0.96),rgba(120,53,15,0.82))] text-white"}`}>
        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/55">Operational focus</div>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight">
              {role === "claimant" ? "Advance claims with a disciplined record." : "Respond with a complete defense record."}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/72">
              {role === "claimant"
                ? "Track what still needs to be filed, reviewed, or escalated before a respondent is pushed into the formal workflow."
                : "Prioritize the cases that need lawyer selection, defense drafting, or factual rebuttal before the dispute advances."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: role === "claimant" ? "My claims" : "Cases against me", value: data.stats.total, icon: Scale },
              { label: "Active", value: data.stats.active, icon: AlertTriangle },
              { label: "Resolved", value: data.stats.resolved, icon: CheckCircle2 },
              { label: "Token balance", value: balance, icon: Coins },
            ].map((item) => {
              const StatIcon = item.icon;
              return (
                <section key={item.label} className="rounded-md border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/70">{item.label}</div>
                    <StatIcon className="h-5 w-5 text-white/65" />
                  </div>
                  <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{item.value}</div>
                </section>
              );
            })}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Urgent", value: data.stats.urgent, icon: AlertTriangle },
          { label: "Review queue", value: data.stats.active + data.stats.urgent, icon: Scale },
        ].map((item) => {
          const StatIcon = item.icon;
          return (
            <section key={item.label} className="rounded-md border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-600">{item.label}</div>
                <StatIcon className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 text-3xl font-semibold tracking-tight text-ink">{item.value}</div>
            </section>
          );
        })}
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-slate-100 p-3">
            <Icon className="h-5 w-5 text-slate-700" />
          </div>
          <h2 className="text-xl font-semibold text-ink">{role === "claimant" ? "My claims" : "Claims against me"}</h2>
        </div>
        {data.cases.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            No cases available for this role yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {data.cases.map((caseItem) => (
              <Link
                key={caseItem.id}
                href={`/cases/${caseItem.id}` as Route}
                className="block rounded-md border border-slate-200 bg-white p-5 transition hover:border-slate-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{caseItem.caseNumber}</div>
                    <h3 className="mt-2 text-lg font-semibold text-ink">{caseItem.title}</h3>
                    <div className="mt-2 text-sm text-slate-600">
                      {caseItem.claimantName || "Unknown claimant"} vs {caseItem.respondentName || "Unknown respondent"}
                    </div>
                  </div>
                  <div className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
                    {caseItem.status.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="mt-4 text-sm text-slate-500">{formatDateTime(caseItem.updatedAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
