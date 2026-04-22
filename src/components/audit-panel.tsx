"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type AuditRecord = {
  id: string;
  title: string | null;
  requestedAt: string | Date;
  snapshotJson: Record<string, unknown>;
  auditJson: Record<string, unknown>;
};

type AuditPanelProps = {
  caseId: string;
  audits: AuditRecord[];
  userRole?: string;
};

export function AuditPanel({ caseId, audits, userRole }: AuditPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<"claimant" | "respondent">("claimant");
  const [title, setTitle] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [, startDeletingTransition] = useTransition();

  async function generateAudit() {
    setError(null);
    setIsGenerating(true); // Immediately set loading state
    
    try {
      const response = await fetch(`/api/cases/${caseId}/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, title }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Failed to generate audit.");
        return;
      }
      setTitle("");
      router.refresh();
    } finally {
      setIsGenerating(false); // Clear loading state when done
    }
  }

  async function deleteAudit(auditId: string) {
    setError(null);
    setIsDeleting(true); // Immediately set loading state
    
    try {
      const response = await fetch(`/api/cases/${caseId}/audit?auditId=${auditId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Failed to delete audit.");
        return;
      }
      startDeletingTransition(() => {
        router.refresh();
      });
    } finally {
      setIsDeleting(false); // Clear loading state when done
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI audit</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Readiness review</h2>
            <p className="mt-2 text-sm text-slate-600">
              Generate a party-side audit that scores the current record, missing proof, and next moves.
            </p>
          </div>
          <select
            value={side}
            onChange={(event) => setSide(event.target.value as "claimant" | "respondent")}
            className="rounded-full border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="claimant">Claimant side</option>
            <option value="respondent">Respondent side</option>
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Optional audit title"
            className="rounded-full border border-slate-300 px-4 py-3 text-sm"
          />
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => void generateAudit()}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate audit"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {audits.length === 0 ? (
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No AI audits yet for this case.
          </div>
        ) : (
          audits.map((audit) => {
            const body = audit.auditJson as {
              executive_summary?: string;
              strengths?: string[];
              weaknesses?: string[];
              missing_information?: string[];
              recommended_next_steps?: string[];
              overall_readiness?: string;
              evidence_assessment?: Array<{ title?: string; relevance?: string; concern?: string }>;
            };
            const snapshot = audit.snapshotJson as { perspective?: string };

            return (
              <article key={audit.id} className="rounded-[28px] border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                      {snapshot.perspective || "Case"} audit
                    </div>
                    <h3 className="mt-2 text-xl font-semibold text-ink">{audit.title || "Untitled audit"}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {body.overall_readiness || "unknown"} readiness
                    </div>
                    {(userRole === "admin" || userRole === "moderator") ? (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => void deleteAudit(audit.id)}
                        className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-sm font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                      >
                        {isDeleting ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-slate-700">{body.executive_summary}</p>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Strengths</div>
                    <ul className="mt-3 space-y-2 text-sm text-emerald-900">
                      {(body.strengths || []).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl bg-amber-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-amber-700">Weaknesses</div>
                    <ul className="mt-3 space-y-2 text-sm text-amber-900">
                      {(body.weaknesses || []).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Missing information</div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {(body.missing_information || []).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Recommended next steps</div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {(body.recommended_next_steps || []).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Evidence assessment</div>
                  <div className="mt-3 space-y-3 text-sm text-slate-700">
                    {(body.evidence_assessment || []).map((item, index) => (
                      <div key={`${audit.id}-${index}`} className="rounded-2xl bg-white p-3">
                        <div className="font-semibold text-slate-900">{item.title || `Evidence ${index + 1}`}</div>
                        <div className="mt-1">{item.relevance}</div>
                        <div className="mt-1 text-slate-500">{item.concern}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
