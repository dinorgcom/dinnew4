"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { LawyerSelectScreen } from "@/components/lawyer-select-screen";
import { PreFilingLawyerChat } from "@/components/pre-filing-lawyer-chat";
import type { LawyerProfile } from "@/lib/lawyers";

type Claim = {
  claim: string;
  details?: string;
};

type CaseEditorProps = {
  mode: "create" | "edit";
  kycVerified?: boolean;
  claimantPrefill?: { name: string; locked: boolean } | null;
  initialCase?: {
    id: string;
    description: string | null;
    category: string | null;
    priority: "low" | "medium" | "high" | "urgent";
    claimantName: string | null;
    claimantEmail: string | null;
    claimantPhone: string | null;
    respondentName: string | null;
    respondentEmail: string | null;
    respondentPhone: string | null;
    claimAmount: string | null;
    currency: string;
    claimantClaims: Record<string, unknown>[] | null;
    respondentClaims: Record<string, unknown>[] | null;
    claimantLawyerKey?: string | null;
  };
};

const categories = [
  "commercial",
  "employment",
  "construction",
  "insurance",
  "intellectual_property",
  "real_estate",
  "consumer",
  "international",
  "other",
] as const;

const priorities = ["low", "medium", "high", "urgent"] as const;

function asClaims(input: Record<string, unknown>[] | null | undefined): Claim[] {
  if (!input?.length) {
    return [{ claim: "", details: "" }];
  }

  return input.map((item) => ({
    claim: typeof item.claim === "string" ? item.claim : "",
    details: typeof item.details === "string" ? item.details : "",
  }));
}

export function CaseEditor({ mode, initialCase, kycVerified = false, claimantPrefill = null }: CaseEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justVerified = searchParams?.get("kycVerified") === "1";
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedLawyer, setSelectedLawyer] = useState<LawyerProfile | null>(null);
  const claimantNameLocked = !!claimantPrefill?.locked;
  const initialClaimantName =
    claimantPrefill?.locked && claimantPrefill.name
      ? claimantPrefill.name
      : initialCase?.claimantName ?? claimantPrefill?.name ?? "";
  const [form, setForm] = useState({
    description: initialCase?.description ?? "",
    category: initialCase?.category ?? "commercial",
    priority: initialCase?.priority ?? "medium",
    claimantName: initialClaimantName,
    claimantEmail: initialCase?.claimantEmail ?? "",
    claimantPhone: initialCase?.claimantPhone ?? "",
    respondentName: initialCase?.respondentName ?? "",
    respondentEmail: initialCase?.respondentEmail ?? "",
    respondentPhone: initialCase?.respondentPhone ?? "",
    claimAmount: initialCase?.claimAmount ?? "",
    currency: initialCase?.currency ?? "USD",
    claimantClaims: asClaims(initialCase?.claimantClaims),
    respondentClaims: asClaims(initialCase?.respondentClaims),
  });

  const titlePreview = useMemo(
    () => `${form.claimantName || "Claimant"} vs ${form.respondentName || "Respondent"}`,
    [form.claimantName, form.respondentName],
  );

  function updateClaim(kind: "claimantClaims" | "respondentClaims", index: number, key: keyof Claim, value: string) {
    setForm((current) => ({
      ...current,
      [kind]: current[kind].map((claim, claimIndex) =>
        claimIndex === index ? { ...claim, [key]: value } : claim,
      ),
    }));
  }

  function addClaim(kind: "claimantClaims" | "respondentClaims") {
    setForm((current) => ({
      ...current,
      [kind]: [...current[kind], { claim: "", details: "" }],
    }));
  }

  function removeClaim(kind: "claimantClaims" | "respondentClaims", index: number) {
    setForm((current) => ({
      ...current,
      [kind]:
        current[kind].length === 1
          ? current[kind]
          : current[kind].filter((_, claimIndex) => claimIndex !== index),
    }));
  }

  async function submit(saveMode: "draft" | "file") {
    setError(null);

    const payload = {
      ...form,
      claimAmount: form.claimAmount ? Number(form.claimAmount) : null,
      claimantClaims: form.claimantClaims.filter((claim) => claim.claim.trim()),
      respondentClaims: form.respondentClaims.filter((claim) => claim.claim.trim()),
      claimantLawyerKey: initialCase?.claimantLawyerKey || selectedLawyer?.id || null,
      saveMode,
    };

    startTransition(async () => {
      const response = await fetch(
        mode === "create" ? "/api/cases" : `/api/cases/${initialCase?.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        if (result.error?.code === "KYC_REQUIRED") {
          const draftCaseId: string | undefined =
            result.error?.details?.draftCaseId ||
            (mode === "edit" ? initialCase?.id : undefined);
          const returnTo = draftCaseId
            ? `/cases/${draftCaseId}/edit?kycVerified=1`
            : mode === "create"
              ? "/cases/new"
              : `/cases/${initialCase?.id}/edit`;
          router.push(`/verify/start?returnTo=${encodeURIComponent(returnTo)}` as Route);
          return;
        }
        setError(result.error?.message || "Failed to save case.");
        return;
      }

      const redirectTo = `/cases/${result.data.id}` as Route;
      router.push(redirectTo);
      router.refresh();
    });
  }

  if (mode === "create" && !selectedLawyer) {
    return <LawyerSelectScreen partyRole="claimant" onSelect={setSelectedLawyer} />;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">
          {mode === "create" ? "Lawyer-led filing" : "Edit case"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">
          {mode === "create" ? "Create a new case" : "Update case details"}
        </h1>
        <p className="text-sm text-[color:var(--ink-soft)]">Preview title: {titlePreview}</p>
      </div>

      {mode === "create" && selectedLawyer ? (
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Chosen lawyer</div>
              <h2 className="mt-2 text-2xl font-semibold text-ink">{selectedLawyer.name}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedLawyer.style}. {selectedLawyer.tagline}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedLawyer(null)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400"
            >
              Change lawyer
            </button>
          </div>
        </div>
      ) : null}

      {mode === "create" && selectedLawyer ? (
        <PreFilingLawyerChat lawyerKey={selectedLawyer.id} draftCaseData={form} />
      ) : null}

      {justVerified && kycVerified ? (
        <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          <div>
            <p className="font-medium">Identity verified</p>
            <p className="mt-0.5 text-emerald-700">
              Your case was saved as a draft while you verified. Review the details below and
              click <strong>Save and file</strong> to submit it.
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 rounded-[28px] border border-slate-200 bg-white p-6 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-medium text-slate-700">Dispute summary</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            rows={4}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Category</span>
          <select
            value={form.category}
            onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
          >
            {categories.map((category) => (
              <option key={category} value={category}>
                {category.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Priority</span>
          <select
            value={form.priority}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                priority: event.target.value as (typeof priorities)[number],
              }))
            }
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
          >
            {priorities.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Claim amount</span>
          <input
            value={form.claimAmount}
            onChange={(event) => setForm((current) => ({ ...current, claimAmount: event.target.value }))}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Currency</span>
          <input
            value={form.currency}
            onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
          />
        </label>
      </section>

      <section className="grid gap-6 rounded-[28px] border border-slate-200 bg-white p-6 md:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Claimant</h2>
          <label className="space-y-2">
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              Name
              {claimantNameLocked ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Verified via Stripe Identity
                </span>
              ) : null}
            </span>
            <input
              value={form.claimantName}
              readOnly={claimantNameLocked}
              disabled={claimantNameLocked}
              onChange={(event) =>
                setForm((current) => ({ ...current, claimantName: event.target.value }))
              }
              className={
                claimantNameLocked
                  ? "w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 shadow-sm"
                  : "w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
              }
            />
            {claimantNameLocked ? (
              <span className="block text-xs text-slate-500">
                This can&rsquo;t be edited because it&rsquo;s the name on your verified ID.
              </span>
            ) : null}
          </label>
          {[
            ["Email", "claimantEmail"],
            ["Phone", "claimantPhone"],
          ].map(([label, key]) => (
            <label key={key} className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <input
                value={form[key as "claimantEmail" | "claimantPhone"]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
              />
            </label>
          ))}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-ink">Respondent</h2>
          {[
            ["Name", "respondentName"],
            ["Email", "respondentEmail"],
            ["Phone", "respondentPhone"],
          ].map(([label, key]) => (
            <label key={key} className="space-y-2">
              <span className="text-sm font-medium text-slate-700">{label}</span>
              <input
                value={form[key as "respondentName" | "respondentEmail" | "respondentPhone"]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
              />
            </label>
          ))}
        </div>
      </section>

      {(["claimantClaims", "respondentClaims"] as const).map((kind) => (
        <section key={kind} className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">
              {kind === "claimantClaims" ? "Claimant claims" : "Respondent claims"}
            </h2>
            <button
              type="button"
              onClick={() => addClaim(kind)}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              Add claim
            </button>
          </div>

          <div className="space-y-4">
            {form[kind].map((claim, index) => (
              <div key={`${kind}-${index}`} className="grid gap-3 rounded-2xl bg-slate-50 p-4">
                <input
                  value={claim.claim}
                  onChange={(event) => updateClaim(kind, index, "claim", event.target.value)}
                  placeholder="Claim title"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
                />
                <textarea
                  value={claim.details || ""}
                  onChange={(event) => updateClaim(kind, index, "details", event.target.value)}
                  placeholder="Supporting detail"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-800 shadow-sm"
                />
                <div>
                  <button
                    type="button"
                    onClick={() => removeClaim(kind, index)}
                    className="text-sm font-medium text-rose-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => submit("draft")}
          className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 disabled:opacity-60"
        >
          Save draft
        </button>
        {kycVerified ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => submit("file")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {mode === "create" ? "Create and file case" : "Save and file"}
          </button>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => submit("file")}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? "Saving draft..." : "Verify identity to file"}
          </button>
        )}
      </div>
    </div>
  );
}
