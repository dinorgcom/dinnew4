"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { upload } from "@vercel/blob/client";
import { ACTION_COSTS } from "@/server/billing/config";
import { formatTokenCost } from "@/lib/utils";

type FileReference = {
  url: string;
  pathname: string;
  fileName: string;
  contentType?: string | null;
  size?: number | null;
};

type LawyerRecord = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  firmName?: string | null;
  firmUrl?: string | null;
  proofFileUrl?: string | null;
  proofFilePathname?: string | null;
  proofFileName?: string | null;
  notes?: string | null;
  status?: string | null;
  calledBy?: string | null;
  reviewState?: string | null;
  invitationTokenExpiresAt?: string | Date | null;
  kycStatus?: string | null;
  kycVerifiedAt?: string | Date | null;
  createdAt: string | Date;
  [key: string]: unknown;
};

type LawyersPanelProps = {
  caseId: string;
  caseRole: string | null;
  canContribute: boolean;
  lawyers: LawyerRecord[];
};

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB

async function uploadCaseFile(caseId: string, category: string, file: File): Promise<FileReference> {
  if (file.size > MAX_BYTES) {
    throw new Error("File is too large. Maximum upload size is 100 MB.");
  }
  const blob = await upload(file.name || "upload.bin", file, {
    access: "private",
    handleUploadUrl: `/api/cases/${caseId}/uploads/token`,
    clientPayload: JSON.stringify({ category }),
  });
  return {
    url: blob.url,
    pathname: blob.pathname,
    fileName: file.name,
    contentType: file.type || null,
    size: file.size || null,
  };
}

export function LawyersPanel({ caseId, caseRole, canContribute, lawyers }: LawyersPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    firmName: "",
    firmUrl: "",
    notes: "",
    proof: null as FileReference | null,
  });

  function resetForm() {
    setForm({
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      postalCode: "",
      country: "",
      firmName: "",
      firmUrl: "",
      notes: "",
      proof: null,
    });
    setEmailError(null);
    setNameError(null);
  }

  async function handleAddLawyer(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!form.fullName.trim()) {
      setNameError("Please enter a full name");
      return;
    }
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    startTransition(async () => {
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, value]) => value !== null && value !== ""),
      );
      const response = await fetch(`/api/cases/${caseId}/lawyers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Failed to add lawyer.");
        return;
      }
      resetForm();
      router.refresh();
    });
  }

  async function handleDelete(lawyerId: string) {
    if (!confirm("Remove this lawyer from the case?")) return;
    setError(null);
    const response = await fetch(`/api/cases/${caseId}/lawyers/${lawyerId}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result?.error?.message || "Delete failed.");
      return;
    }
    router.refresh();
  }

  function handleResend(lawyerId: string) {
    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/lawyers/${lawyerId}/resend`, {
        method: "POST",
      });
      if (response.ok) {
        router.refresh();
      }
    });
  }

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadCaseFile(caseId, "lawyer-proof", file);
      setForm((current) => ({ ...current, proof: uploaded }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function statusBadge(record: LawyerRecord) {
    const idChecked = record.kycStatus === "verified";
    const accepted = record.status === "accepted";
    const linkExpired =
      record.invitationTokenExpiresAt &&
      new Date(record.invitationTokenExpiresAt as string) < new Date();
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {idChecked ? (
          <span
            title="Identity verified via KYC"
            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
            </svg>
            ID checked
          </span>
        ) : null}
        {accepted ? (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Accepted
          </span>
        ) : linkExpired ? (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Link expired
          </span>
        ) : !idChecked ? (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            Pending
          </span>
        ) : null}
      </span>
    );
  }

  function proofLink(lawyerId: string): Route {
    return `/api/files/lawyers/${lawyerId}` as Route;
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {canContribute ? (
        <form className="grid gap-3 rounded-md bg-slate-50 p-4 md:grid-cols-2" onSubmit={handleAddLawyer}>
          {[
            { key: "fullName", label: "Full Name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone (optional)" },
            { key: "firmName", label: "Firm name (optional)" },
            { key: "firmUrl", label: "Firm website URL (optional)" },
            { key: "address", label: "Street address (optional)" },
            { key: "postalCode", label: "Postal code (optional)" },
            { key: "city", label: "City (optional)" },
            { key: "country", label: "Country (optional)" },
          ].map(({ key, label }) => (
            <div key={key}>
              <input
                value={form[key as keyof typeof form] as string}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((current) => ({ ...current, [key]: value }));
                  if (key === "email") {
                    setEmailError(null);
                    if (value && !value.match(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)) {
                      setEmailError("Please enter a valid email address");
                    }
                  }
                  if (key === "fullName") {
                    setNameError(null);
                    if (!value.trim()) setNameError("Please enter a full name");
                  }
                }}
                placeholder={label}
                className={`w-full rounded-md border px-4 py-3 text-sm ${
                  (key === "email" && emailError) || (key === "fullName" && nameError)
                    ? "border-red-300 focus:border-red-500"
                    : "border-slate-300 focus:border-slate-400"
                }`}
              />
              {key === "email" && emailError ? (
                <p className="mt-1 text-xs text-red-600">{emailError}</p>
              ) : null}
              {key === "fullName" && nameError ? (
                <p className="mt-1 text-xs text-red-600">{nameError}</p>
              ) : null}
            </div>
          ))}

          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Notes (optional)"
            rows={3}
            className="rounded-md border border-slate-300 px-4 py-3 text-sm md:col-span-2"
          />

          {form.proof ? (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 md:col-span-2">
              Proof attached: {form.proof.fileName}
            </div>
          ) : null}

          <div className="md:col-span-2">
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400"
            >
              {uploading ? "Uploading..." : "Attach proof of admission to the bar (optional)"}
            </button>
            <p className="mt-1 text-xs text-slate-500">
              Bar membership card, certificate or admission letter — used to verify the lawyer is licensed.
            </p>
          </div>

          <button
            type="submit"
            disabled={isPending || uploading || !!emailError || !!nameError}
            className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2"
          >
            Add lawyer ({formatTokenCost(ACTION_COSTS.lawyer_create)})
          </button>
        </form>
      ) : null}

      {lawyers.length === 0 ? (
        <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
          No lawyers added yet.
        </div>
      ) : (
        <div className="space-y-3">
          {lawyers.map((lawyer) => {
            const isExpanded = expanded === lawyer.id;
            const calledBy =
              lawyer.calledBy === "claimant"
                ? "Claimant"
                : lawyer.calledBy === "respondent"
                  ? "Respondent"
                  : "Arbitrator";
            return (
              <div
                key={lawyer.id}
                className="rounded-md border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : lawyer.id)}
                    className="flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {lawyer.fullName}
                      {statusBadge(lawyer)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {lawyer.firmName ? `${lawyer.firmName} · ` : ""}
                      Retained by {calledBy}
                    </div>
                  </button>
                  {canContribute ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResend(lawyer.id)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                      >
                        Resend invite
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(lawyer.id)}
                        className="rounded-md border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-400"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                {isExpanded ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-700">Email:</span> {lawyer.email}
                    </div>
                    {lawyer.phone ? (
                      <div>
                        <span className="font-semibold text-slate-700">Phone:</span> {lawyer.phone}
                      </div>
                    ) : null}
                    {lawyer.firmName ? (
                      <div>
                        <span className="font-semibold text-slate-700">Firm:</span> {lawyer.firmName}
                      </div>
                    ) : null}
                    {lawyer.firmUrl ? (
                      <div>
                        <span className="font-semibold text-slate-700">Firm website:</span>{" "}
                        <a
                          href={lawyer.firmUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-rose-700 underline"
                        >
                          {lawyer.firmUrl}
                        </a>
                      </div>
                    ) : null}
                    {lawyer.address || lawyer.city || lawyer.postalCode || lawyer.country ? (
                      <div>
                        <span className="font-semibold text-slate-700">Address:</span>{" "}
                        {[lawyer.address, lawyer.postalCode, lawyer.city, lawyer.country]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    ) : null}
                    {lawyer.notes ? (
                      <div>
                        <span className="font-semibold text-slate-700">Notes:</span> {lawyer.notes}
                      </div>
                    ) : null}
                    {lawyer.proofFileUrl ? (
                      <div className="pt-1">
                        <Link
                          href={proofLink(lawyer.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                        >
                          View proof of admission
                          {lawyer.proofFileName ? ` (${lawyer.proofFileName})` : ""}
                        </Link>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
