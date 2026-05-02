"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PARTY_APPROVAL_EXTENSION_COSTS,
  PARTY_APPROVAL_MAX_EXTENSIONS,
} from "@/server/billing/config";

type PartyRecord = {
  id: string;
  side: "claimant" | "respondent";
  fullName: string;
  email: string;
  phone?: string | null;
  status:
    | "pending_approval"
    | "pending_acceptance"
    | "active"
    | "declined"
    | "removed";
  isOriginal: boolean;
  invitedByPartyId?: string | null;
  approvalDeadline?: string | Date | null;
  approvalExtensions?: number | null;
  approvalVotesJson?: Record<string, "approve" | "reject"> | null;
  joinedAt?: string | Date | null;
  notes?: string | null;
  kycStatus?: string | null;
};

type AdditionalPartiesPanelProps = {
  caseId: string;
  caseRole: string | null;
  parties: PartyRecord[];
  // The party-id of the viewer (if they have an active row in case_parties)
  viewerPartyId: string | null;
};

const SIDES: Array<{ value: "claimant" | "respondent"; label: string }> = [
  { value: "claimant", label: "Co-claimant" },
  { value: "respondent", label: "Co-respondent" },
];

export function AdditionalPartiesPanel({
  caseId,
  caseRole,
  parties,
  viewerPartyId,
}: AdditionalPartiesPanelProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [voteSubmitting, setVoteSubmitting] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    side: "claimant" as "claimant" | "respondent",
    fullName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    postalCode: "",
    country: "",
    notes: "",
  });

  const isParty = caseRole === "claimant" || caseRole === "respondent";

  function reset() {
    setForm({
      side: "claimant",
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      postalCode: "",
      country: "",
      notes: "",
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.fullName.trim()) {
      setError("Full name is required");
      return;
    }
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)) {
      setError("Valid email address is required");
      return;
    }
    startTransition(async () => {
      const response = await fetch(`/api/cases/${caseId}/parties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Failed to invite party");
        return;
      }
      reset();
      router.refresh();
    });
  }

  async function handleExtend(partyId: string) {
    setError(null);
    setExtendingId(partyId);
    try {
      const response = await fetch(`/api/cases/${caseId}/parties/${partyId}/extend`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Failed to extend deadline");
        return;
      }
      router.refresh();
    } finally {
      setExtendingId(null);
    }
  }

  async function handleVote(partyId: string, vote: "approve" | "reject") {
    setError(null);
    setVoteSubmitting(`${partyId}:${vote}`);
    try {
      const response = await fetch(`/api/cases/${caseId}/parties/${partyId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Failed to record vote");
        return;
      }
      router.refresh();
    } finally {
      setVoteSubmitting(null);
    }
  }

  function statusLabel(status: PartyRecord["status"], isOriginal: boolean) {
    if (isOriginal) {
      return (
        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          Original party
        </span>
      );
    }
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            Joined
          </span>
        );
      case "pending_approval":
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            Awaiting approval
          </span>
        );
      case "pending_acceptance":
        return (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
            Invitation sent
          </span>
        );
      case "declined":
        return (
          <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
            Declined
          </span>
        );
      case "removed":
        return (
          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            Removed
          </span>
        );
      default:
        return null;
    }
  }

  const grouped = {
    claimant: parties.filter((p) => p.side === "claimant"),
    respondent: parties.filter((p) => p.side === "respondent"),
  };

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          You can add more people to either side of the case. <strong>All current
          parties must approve</strong> the addition or the deadline expires (after
          which the addition is automatically allowed). Once approved, the new
          person receives an invitation by email and can join the case.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Witnesses are not parties — they are added on the Witnesses tab and
          do not require approval or login.
        </p>
      </div>

      {(["claimant", "respondent"] as const).map((side) => (
        <section key={side} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            {side === "claimant" ? "Claimant side" : "Respondent side"}
            <span className="ml-2 text-xs font-normal text-slate-400">
              ({grouped[side].length})
            </span>
          </h3>

          {grouped[side].length === 0 ? (
            <div className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No parties on this side yet.
            </div>
          ) : (
            <div className="space-y-2">
              {grouped[side].map((party) => {
                const votes = party.approvalVotesJson || {};
                const viewerVote = viewerPartyId ? votes[viewerPartyId] : null;
                const canVote =
                  isParty &&
                  !party.isOriginal &&
                  party.status === "pending_approval" &&
                  viewerPartyId &&
                  party.invitedByPartyId !== viewerPartyId &&
                  !viewerVote;
                return (
                  <div
                    key={party.id}
                    className="rounded-md border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                          {party.fullName}
                          {statusLabel(party.status, party.isOriginal)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {party.email}
                          {party.phone ? ` · ${party.phone}` : ""}
                        </div>
                        {party.notes ? (
                          <div className="mt-1 text-xs text-slate-500">
                            {party.notes}
                          </div>
                        ) : null}
                        {party.status === "pending_approval" && party.approvalDeadline ? (
                          <div className="mt-1 text-xs text-slate-400">
                            Approval deadline:{" "}
                            {new Date(party.approvalDeadline as string).toLocaleString()}
                            {party.approvalExtensions
                              ? ` (extended ${party.approvalExtensions}×)`
                              : null}
                          </div>
                        ) : null}
                        {party.status === "pending_approval" && isParty ? (() => {
                          const used = party.approvalExtensions ?? 0;
                          if (used >= PARTY_APPROVAL_MAX_EXTENSIONS) {
                            return (
                              <div className="mt-1 text-xs text-slate-400">
                                No more extensions available — auto-approves at deadline.
                              </div>
                            );
                          }
                          const cost = PARTY_APPROVAL_EXTENSION_COSTS[used];
                          return (
                            <button
                              type="button"
                              disabled={extendingId === party.id}
                              onClick={() => void handleExtend(party.id)}
                              className="mt-2 rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
                            >
                              {extendingId === party.id
                                ? "Extending..."
                                : `Extend by 7 days (${cost} tokens)`}
                            </button>
                          );
                        })() : null}
                      </div>
                      {canVote ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            disabled={voteSubmitting !== null}
                            onClick={() => void handleVote(party.id, "approve")}
                            className="rounded-md border border-emerald-300 px-3 py-1 text-xs font-medium text-emerald-700 transition hover:border-emerald-400 disabled:opacity-60"
                          >
                            {voteSubmitting === `${party.id}:approve`
                              ? "Approving..."
                              : "Approve"}
                          </button>
                          <button
                            type="button"
                            disabled={voteSubmitting !== null}
                            onClick={() => void handleVote(party.id, "reject")}
                            className="rounded-md border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-400 disabled:opacity-60"
                          >
                            {voteSubmitting === `${party.id}:reject`
                              ? "Rejecting..."
                              : "Reject"}
                          </button>
                        </div>
                      ) : viewerVote ? (
                        <div className="text-xs text-slate-500">
                          Your vote: <strong className="text-slate-700">{viewerVote}</strong>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {isParty ? (
        <form className="grid gap-3 rounded-md bg-slate-50 p-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <h3 className="text-sm font-semibold text-slate-700 md:col-span-2">
            Propose an additional party
          </h3>
          <select
            value={form.side}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                side: event.target.value as "claimant" | "respondent",
              }))
            }
            className="rounded-md border border-slate-300 px-4 py-3 text-sm md:col-span-2"
          >
            {SIDES.map((option) => (
              <option key={option.value} value={option.value}>
                Add as {option.label}
              </option>
            ))}
          </select>
          {[
            { key: "fullName", label: "Full name" },
            { key: "email", label: "Email" },
            { key: "phone", label: "Phone (optional)" },
            { key: "address", label: "Street address (optional)" },
            { key: "postalCode", label: "Postal code (optional)" },
            { key: "city", label: "City (optional)" },
            { key: "country", label: "Country (optional)" },
          ].map(({ key, label }) => (
            <input
              key={key}
              value={form[key as "fullName" | "email" | "phone" | "address" | "postalCode" | "city" | "country"]}
              onChange={(event) =>
                setForm((current) => ({ ...current, [key]: event.target.value }))
              }
              placeholder={label}
              className="rounded-md border border-slate-300 px-4 py-3 text-sm"
            />
          ))}
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="Notes for other parties (optional)"
            rows={2}
            className="rounded-md border border-slate-300 px-4 py-3 text-sm md:col-span-2"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 md:col-span-2"
          >
            {isPending ? "Proposing..." : "Propose addition"}
          </button>
          <p className="text-xs text-slate-500 md:col-span-2">
            All current parties on the case must approve. If no decision is made
            in 7 days, the addition goes through automatically and the invitee
            receives an email link to join.
          </p>
        </form>
      ) : null}
    </div>
  );
}
