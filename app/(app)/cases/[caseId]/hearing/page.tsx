import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseAiNav } from "@/components/case-ai-nav";
import { HearingScheduler } from "@/components/hearing-scheduler";
import { AITestingInterface } from "@/components/ai-testing-interface";
import { VoiceTestPanel } from "@/components/voice-test-panel";
import { ensureAppUser } from "@/server/auth/provision";
import { getCaseDetail } from "@/server/cases/queries";
import { getDb } from "@/db/client";
import { cases } from "@/db/schema";
import { eq } from "drizzle-orm";

type PageProps = {
  params: Promise<{ caseId: string }>;
};

export default async function CaseHearingPage({ params }: PageProps) {
  const { caseId } = await params;
  const user = await ensureAppUser();
  
  // First check if user is admin/moderator
  const isAdminOrModerator = user?.role === "admin" || user?.role === "moderator";
  
  let detail;
  
  if (isAdminOrModerator) {
    // For admins/moderators, try to get case detail but fall back to minimal case info
    detail = await getCaseDetail(user, caseId);
    
    if (detail) {
      // Override the role with admin/moderator role for admins
      detail.role = user.role as 'admin' | 'moderator';
    }
    
    if (!detail) {
      // Admin/moderator fallback: get basic case info directly
      const db = getDb();
      const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
      const caseItem = caseRows[0];
      
      if (!caseItem) {
        notFound();
      }
      
      // Create minimal detail object for admin access
      detail = {
        case: caseItem,
        role: user.role as 'admin' | 'moderator',
        evidence: [],
        witnesses: [],
        consultants: [],
        activities: [],
        expertiseRequests: [],
        messages: [],
        conversations: [],
      };
    }
  } else {
    // For regular users, use the normal getCaseDetail which checks case association
    detail = await getCaseDetail(user, caseId);
    
    if (!detail) {
      notFound();
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <Link href={`/cases/${caseId}`} className="font-medium text-signal hover:text-teal-800">
          {detail.case.caseNumber}
        </Link>
        <span>/</span>
        <span>Hearing</span>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Phase 6</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Virtual Court Hearing</h1>
        </div>
        <CaseAiNav caseId={caseId} />
      </div>

      {/* Hearing Room Placeholder */}
      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-ink">Court Hearing Room</h2>
            <p className="mt-2 text-slate-600">Case: {detail.case.title}</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800">
              <div className="h-2 w-2 rounded-full bg-amber-600 animate-pulse"></div>
              Session Not Started
            </div>
          </div>

          {/* Participants Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            {/* Judge */}
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="h-8 w-8 text-slate-500">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z" />
                </svg>
              </div>
              <h3 className="font-medium text-ink">Judge</h3>
              <p className="text-sm text-slate-500 mt-1">Awaiting</p>
            </div>

            {/* Claimant */}
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-blue-200 flex items-center justify-center">
                <svg className="h-8 w-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-ink">Claimant</h3>
              <p className="text-sm text-slate-500 mt-1">{detail.case.claimantName}</p>
            </div>

            {/* Defendant */}
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-red-200 flex items-center justify-center">
                <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-ink">Defendant</h3>
              <p className="text-sm text-slate-500 mt-1">{detail.case.respondentName}</p>
            </div>

            {/* Lawyers */}
            <div className="rounded-lg border-2 border-slate-300 bg-slate-50 p-4 text-center">
              <div className="mx-auto mb-3 h-16 w-16 rounded-full bg-green-200 flex items-center justify-center">
                <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="font-medium text-ink">Legal Counsel</h3>
              <p className="text-sm text-slate-500 mt-1">Both Parties</p>
            </div>
          </div>

          {/* Additional Participants */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            {/* Witnesses */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-ink">Witnesses</h4>
              <p className="text-xs text-slate-500">{detail.witnesses?.length || 0} available</p>
            </div>

            {/* Experts */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-ink">Experts</h4>
              <p className="text-xs text-slate-500">{detail.consultants?.length || 0} available</p>
            </div>

            {/* Transcription */}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
              <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-teal-100 flex items-center justify-center">
                <svg className="h-6 w-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-ink">Transcript</h4>
              <p className="text-xs text-slate-500">AI Powered</p>
            </div>
          </div>

          {/* Hearing Scheduler */}
          <div className="mt-8">
            <HearingScheduler caseId={caseId} caseTitle={detail.case.title} />
          </div>

          {/* AI Testing Interface */}
          <div className="mt-8">
            <AITestingInterface caseId={caseId} caseTitle={detail.case.title} />
          </div>

          {/* Voice Test Panel */}
          <div className="mt-8">
            <VoiceTestPanel caseId={caseId} caseTitle={detail.case.title} />
          </div>
        </div>
      </div>
    </div>
  );
}
