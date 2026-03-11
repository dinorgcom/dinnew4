import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { CaseWorkspace } from "@/components/case-workspace";
import { formatCurrency, formatDateTime } from "@/server/format";

type CaseDetailPageProps = {
  params: Promise<{ caseId: string }>;
};

const infoPairs = [
  ["Status", "status"],
  ["Priority", "priority"],
  ["Category", "category"],
] as const;

const aiLinks = [
  { href: "audit", label: "AI audit", description: "Review strengths, gaps, and readiness." },
  { href: "arbitration", label: "Arbitration", description: "Generate or accept a settlement proposal." },
  { href: "judgement", label: "Judgement", description: "Draft and finalize a structured decision." },
  { href: "lawyer-chat", label: "Lawyer chat", description: "Get case-specific strategic guidance." },
] as const;

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
  const appUser = await ensureAppUser();
  const detail = await getCaseDetail(appUser, caseId);

  if (!detail) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <Link href="/cases" className="font-medium text-signal hover:text-teal-800">
          Cases
        </Link>
        <span>/</span>
        <span>{detail.case.caseNumber}</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              {detail.case.caseNumber}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink">{detail.case.title}</h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-600">
              {detail.case.description || "No case description has been added yet."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {infoPairs.map(([label, key]) => (
              <div key={label} className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</div>
                <div className="mt-2 text-sm font-semibold capitalize text-slate-900">
                  {(detail.case[key] as string | null)?.replaceAll("_", " ") || "Not set"}
                </div>
              </div>
            ))}
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Role</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{detail.roleLabel}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Claim amount</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {formatCurrency(detail.case.claimAmount, detail.case.currency)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Claimant</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{detail.case.claimantName || "Unknown"}</div>
                <div>{detail.case.claimantEmail || "No email"}</div>
                <div>{detail.case.claimantPhone || "No phone"}</div>
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Respondent</div>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-900">{detail.case.respondentName || "Unknown"}</div>
                <div>{detail.case.respondentEmail || "No email"}</div>
                <div>{detail.case.respondentPhone || "No phone"}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[28px] bg-ink p-6 text-white">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Overview</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {detail.summaryCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{card.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-white">{card.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-ink">Recent activity</h2>
              <div className="text-sm text-slate-500">{detail.activities.length} events</div>
            </div>
            <div className="mt-5 space-y-4">
              {detail.activities.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  No activity recorded yet for this case.
                </div>
              ) : (
                detail.activities.map((activity) => (
                  <div key={activity.id} className="rounded-2xl bg-slate-50 p-4">
                    <div className="font-semibold text-slate-900">{activity.title}</div>
                    <div className="mt-1 text-sm text-slate-600">{activity.description || activity.type}</div>
                    <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">
                      {formatDateTime(activity.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <CaseWorkspace
        caseId={detail.case.id}
        roleLabel={detail.roleLabel}
        canContribute={detail.role !== "moderator" && detail.role !== "admin"}
        evidence={detail.evidence}
        witnesses={detail.witnesses}
        consultants={detail.consultants}
        expertiseRequests={detail.expertiseRequests}
        messages={detail.messages}
      />

      <section className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Phase 5</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">AI workflows</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {aiLinks.map((item) => (
            <Link
              key={item.href}
              href={`/cases/${detail.case.id}/${item.href}`}
              className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 transition hover:border-slate-300 hover:bg-white"
            >
              <div className="font-semibold text-slate-900">{item.label}</div>
              <div className="mt-2 text-sm leading-6 text-slate-600">{item.description}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
