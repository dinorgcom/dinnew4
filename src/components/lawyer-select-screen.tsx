"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { getLawyersBySide, type LawyerProfile } from "@/lib/lawyers";
import { cn } from "@/lib/utils";

type LawyerSelectScreenProps = {
  partyRole: "claimant" | "respondent";
  caseId?: string;
  onSelect?: (lawyer: LawyerProfile) => void;
};

export function LawyerSelectScreen({ partyRole, caseId, onSelect }: LawyerSelectScreenProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lawyers = getLawyersBySide(partyRole);
  const selectedLawyer = lawyers.find((item) => item.id === selected) || null;

  async function confirm() {
    const lawyer = lawyers.find((item) => item.id === selected);
    if (!lawyer) {
      return;
    }

    if (onSelect) {
      onSelect(lawyer);
      return;
    }

    if (!caseId) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const response = await fetch(`/api/cases/${caseId}/lawyer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: partyRole, lawyerKey: lawyer.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to save lawyer choice.");
      }
      router.push(`/cases/${caseId}`);
      router.refresh();
    } catch (selectionError) {
      setError(selectionError instanceof Error ? selectionError.message : "Failed to save lawyer choice.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="inline-flex rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          {partyRole === "claimant" ? "Filing a claim" : "Responding to a claim"}
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink">Choose your DIN.ORG Guide</h1>
        <p className="max-w-3xl text-sm leading-7 text-[color:var(--ink-soft)]">
          The Guide is your AI counsel for this case — it drafts, asks questions, and walks you
          through the next step. Pick the style that fits you.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Available guides</div>
          </div>
          <div className="divide-y divide-slate-200">
            {lawyers.map((lawyer) => {
              const isSelected = selected === lawyer.id;
              return (
                <button
                  key={lawyer.id}
                  type="button"
                  onClick={() => setSelected(lawyer.id)}
                  className={cn(
                    "grid w-full gap-4 px-4 py-4 text-left transition sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] sm:items-center",
                    isSelected ? "bg-ink text-white" : "bg-white text-ink hover:bg-slate-50",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-xl",
                      isSelected ? "bg-white/10" : "bg-slate-100",
                    )}>
                      {lawyer.emoji}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{lawyer.name}</div>
                      <div className={cn("truncate text-sm", isSelected ? "text-white/65" : "text-slate-500")}>
                        {lawyer.style}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className={cn("text-sm font-medium", isSelected ? "text-white" : "text-slate-900")}>
                      {lawyer.tagline}
                    </div>
                    <p className={cn("mt-1 line-clamp-2 text-sm leading-6", isSelected ? "text-white/70" : "text-slate-600")}>
                      {lawyer.description}
                    </p>
                  </div>

                  <div className="flex justify-start sm:justify-end">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Selected
                      </span>
                    ) : (
                      <span className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Choose
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:self-start">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Selection notes</div>
          <div className="mt-3 space-y-3 text-sm leading-6 text-[color:var(--ink-soft)]">
            <p>Pick the Guide style that matches how you want your case framed and what kind of drafting support you want.</p>
            <p>Claimants usually benefit from decisive framing. Respondents often prefer a more forensic or skeptical posture.</p>
          </div>
          {selectedLawyer ? (
            <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 ring-1 ring-slate-200">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                {selectedLawyer.name}
              </div>
              <div className="mt-1 text-sm text-slate-500">{selectedLawyer.style}</div>
            </div>
          ) : null}
        </aside>
      </div>

      <div className="flex justify-start">
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void confirm()}
          className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm Guide"}
        </button>
      </div>
    </div>
  );
}
