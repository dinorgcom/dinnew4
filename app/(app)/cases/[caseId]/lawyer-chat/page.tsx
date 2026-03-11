import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseAiNav } from "@/components/case-ai-nav";
import { LawyerChatPanel } from "@/components/lawyer-chat-panel";
import { ensureAppUser } from "@/server/auth/provision";
import { getLawyerConversation } from "@/server/ai/case-workflows";
import { getCaseDetail } from "@/server/cases/queries";

type PageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function CaseLawyerChatPage({ params }: PageProps) {
  const { caseId } = await params;
  const user = await ensureAppUser();
  const detail = await getCaseDetail(user, caseId);

  if (!detail) {
    notFound();
  }

  const conversation =
    detail.role === "claimant" || detail.role === "respondent"
      ? await getLawyerConversation(user, caseId)
      : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <Link href={`/cases/${caseId}`} className="font-medium text-signal hover:text-teal-800">
          {detail.case.caseNumber}
        </Link>
        <span>/</span>
        <span>Lawyer chat</span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Phase 5</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">AI lawyer workspace</h1>
        </div>
        <CaseAiNav caseId={caseId} />
      </div>

      <LawyerChatPanel
        caseId={caseId}
        canUseChat={detail.role === "claimant" || detail.role === "respondent"}
        initialConversation={conversation}
      />
    </div>
  );
}
