"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getLawyersBySide, type LawyerProfile } from "@/lib/lawyers";

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
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink">Choose your virtual lawyer</h1>
        <p className="max-w-3xl text-sm leading-7 text-[color:var(--ink-soft)]">
          This choice drives the drafting and strategic guidance experience for the case.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
        {lawyers.map((lawyer) => (
          <button
            key={lawyer.id}
            type="button"
            onClick={() => setSelected(lawyer.id)}
            className={`rounded-md border p-6 text-left transition ${
              selected === lawyer.id
                ? "border-slate-900 bg-slate-900 text-white shadow-lg"
                : "border-slate-200 bg-white hover:-translate-y-1 hover:border-slate-300"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-3xl">{lawyer.emoji}</div>
                <h2 className="mt-4 text-2xl font-semibold">{lawyer.name}</h2>
                <div className={selected === lawyer.id ? "text-slate-300" : "text-slate-500"}>
                  {lawyer.style}
                </div>
              </div>
              {selected === lawyer.id ? (
                <div className="rounded-md bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.16em] text-white">
                  Selected
                </div>
              ) : null}
            </div>
            <div className={`mt-4 text-sm ${selected === lawyer.id ? "text-slate-200" : "text-slate-600"}`}>
              {lawyer.tagline}
            </div>
            <p className={`mt-4 text-sm leading-7 ${selected === lawyer.id ? "text-slate-300" : "text-slate-600"}`}>
              {lawyer.description}
            </p>
          </button>
        ))}
        <aside className="rounded-md border border-[color:var(--line-soft)] bg-[color:var(--bg-panel)] p-6 lg:sticky lg:top-6 lg:self-start">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Selection notes</div>
          <div className="mt-4 space-y-4 text-sm leading-7 text-[color:var(--ink-soft)]">
            <p>Choose the counsel style that matches the tone of your case record and the kind of drafting support you want.</p>
            <p>Claimants usually benefit from decisive framing. Respondents often prefer a more forensic or skeptical posture.</p>
          </div>
          <div className="mt-6 rounded-md bg-slate-950 px-5 py-4 text-white">
            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Current choice</div>
            <div className="mt-3 text-lg font-semibold">
              {lawyers.find((item) => item.id === selected)?.name || "No lawyer selected"}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {lawyers.find((item) => item.id === selected)?.tagline || "Pick a lawyer to unlock drafting and guidance for this case."}
            </p>
          </div>
        </aside>
      </div>

      <div className="flex justify-start lg:hidden">
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void confirm()}
          className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm lawyer"}
        </button>
      </div>
      <div className="hidden justify-start lg:flex">
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void confirm()}
          className="rounded-md bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Confirm lawyer"}
        </button>
      </div>
    </div>
  );
}
