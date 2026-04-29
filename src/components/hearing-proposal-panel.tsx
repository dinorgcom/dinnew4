"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Proposal = {
  id: string;
  status: "open" | "confirmed" | "expired";
  slots: string[];
  availability: {
    claimant?: (boolean | null)[];
    respondent?: (boolean | null)[];
  };
  selectedSlotIndex: number | null;
  votingDeadline: string | null;
};

type Discovery = {
  complete: boolean;
  reason: "tasks-settled" | "both-parties-ready" | "inactivity" | "incomplete";
  pendingEvidence: number;
  pendingWitnesses: number;
  pendingExpertise: number;
  claimantReadyAt: string | null;
  respondentReadyAt: string | null;
  inactivityCloseAt: string | null;
};

type Props = {
  caseId: string;
  caseRole: "claimant" | "respondent" | "moderator" | string | null;
};

function daysFromNow(iso: string | null) {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const ms = target - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function formatShortDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatSlot(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function HearingProposalPanel({ caseId, caseRole }: Props) {
  const router = useRouter();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const response = await fetch(`/api/cases/${caseId}/hearing-proposals`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Failed");
      setProposal(result.data.proposal);
      setDiscovery(result.data.discovery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function send(body: Record<string, unknown>, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/hearing-proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Failed");
      await load();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <section className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Loading hearing proposal...
      </section>
    );
  }

  if (discovery && !discovery.complete && (!proposal || proposal.status === "expired")) {
    const isModerator = caseRole === "moderator";
    const isParty = caseRole === "claimant" || caseRole === "respondent";
    const tasksSettled =
      discovery.pendingEvidence === 0 &&
      discovery.pendingWitnesses === 0 &&
      discovery.pendingExpertise === 0;
    const claimantReady = !!discovery.claimantReadyAt;
    const respondentReady = !!discovery.respondentReadyAt;
    const myReady =
      caseRole === "claimant" ? claimantReady : caseRole === "respondent" ? respondentReady : false;
    const inactivityDays = daysFromNow(discovery.inactivityCloseAt);
    const inactivityClose = formatShortDate(discovery.inactivityCloseAt);

    async function markReady() {
      try {
        setBusy("ready");
        const response = await fetch(`/api/cases/${caseId}/discovery-ready`, {
          method: "POST",
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message || "Failed");
        }
        await load();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setBusy(null);
      }
    }

    return (
      <section className="rounded-md border border-slate-200 bg-slate-100 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Discovery {tasksSettled ? "ready to close" : "in progress"}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          {tasksSettled ? "Confirm you're ready for the hearing" : "Hearing scheduling is locked"}
        </h2>
        <p className="mt-2 text-sm text-slate-700">
          {tasksSettled
            ? "All evidence, witnesses and expertise have settled. Each party should now confirm they're ready for the hearing. The AI suggests 5 slots once both parties confirm — or after 14 days of inactivity."
            : "Once every evidence, witness and expertise review is settled the AI can suggest 5 candidate hearing slots."}
          {isModerator ? " As a moderator you can force-generate slots anyway below." : ""}
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-3 text-sm text-slate-800">
          <li className="rounded-md bg-white p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Evidence pending</div>
            <div className="mt-1 text-xl font-semibold">{discovery.pendingEvidence}</div>
          </li>
          <li className="rounded-md bg-white p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Witnesses pending</div>
            <div className="mt-1 text-xl font-semibold">{discovery.pendingWitnesses}</div>
          </li>
          <li className="rounded-md bg-white p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Expertise pending</div>
            <div className="mt-1 text-xl font-semibold">{discovery.pendingExpertise}</div>
          </li>
        </ul>

        {tasksSettled ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div
              className={`rounded-md border p-3 text-sm ${
                claimantReady
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Claimant</div>
              <div className="mt-1 font-semibold">
                {claimantReady ? "✓ Ready for hearing" : "Pending confirmation"}
              </div>
              {claimantReady ? (
                <div className="mt-1 text-xs text-slate-500">
                  {formatShortDate(discovery.claimantReadyAt)}
                </div>
              ) : null}
            </div>
            <div
              className={`rounded-md border p-3 text-sm ${
                respondentReady
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Respondent</div>
              <div className="mt-1 font-semibold">
                {respondentReady ? "✓ Ready for hearing" : "Pending confirmation"}
              </div>
              {respondentReady ? (
                <div className="mt-1 text-xs text-slate-500">
                  {formatShortDate(discovery.respondentReadyAt)}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {tasksSettled && inactivityDays !== null ? (
          <p className="mt-3 text-xs text-slate-500">
            Inactivity auto-close: discovery will be considered complete on{" "}
            <span className="font-semibold">{inactivityClose}</span> ({inactivityDays}{" "}
            {inactivityDays === 1 ? "day" : "days"} from now) if no further activity.
          </p>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          {tasksSettled && isParty && !myReady ? (
            <button
              type="button"
              onClick={() => void markReady()}
              disabled={busy !== null}
              className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "ready" ? "Confirming..." : "I'm ready for the hearing"}
            </button>
          ) : null}
          {tasksSettled && isParty && myReady ? (
            <span className="self-center rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
              You confirmed ready
            </span>
          ) : null}
          {isModerator ? (
            <button
              type="button"
              onClick={() => void send({ action: "generate" }, "generate")}
              disabled={busy !== null}
              className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "generate"
                ? "Generating..."
                : "Force-generate slots (moderator)"}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  if (!proposal || proposal.status === "expired") {
    return (
      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Schedule the hearing</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Discovery complete
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Generate 5 AI-suggested time slots. Each party then marks which they can attend; the
          slot most parties can attend wins.
        </p>
        {error ? (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void send({ action: "generate" }, "generate")}
          disabled={busy !== null}
          className="mt-5 rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy === "generate" ? "Generating..." : "Get 5 AI-suggested slots"}
        </button>
      </section>
    );
  }

  // open or confirmed
  const slots = proposal.slots || [];
  const claimantA = proposal.availability?.claimant ?? [];
  const respondentA = proposal.availability?.respondent ?? [];

  function tallyFor(index: number) {
    const c = claimantA[index] ?? null;
    const r = respondentA[index] ?? null;
    const yes = (c === true ? 1 : 0) + (r === true ? 1 : 0);
    return { c, r, yes, bothYes: c === true && r === true };
  }

  const isParty = caseRole === "claimant" || caseRole === "respondent";
  const isModeratorOrParty = isParty || caseRole === "moderator";

  const votingDays = daysFromNow(proposal.votingDeadline);
  const votingClose = formatShortDate(proposal.votingDeadline);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6 space-y-4">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
          {proposal.status === "confirmed" ? "Hearing confirmed" : "Hearing slot voting"}
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          {proposal.status === "confirmed"
            ? "A slot has been confirmed"
            : "5 candidate slots"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {proposal.status === "confirmed"
            ? "The case has been moved to hearing scheduled. The video session will be opened on the chosen day."
            : "Mark every slot you can attend. The slot with the most yes votes wins; ties break to the earliest slot. Voting closes automatically after 7 days."}
        </p>
        {proposal.status === "open" && votingClose ? (
          <p className="mt-2 text-xs text-slate-500">
            Voting closes on <span className="font-semibold">{votingClose}</span>
            {votingDays !== null
              ? ` (${votingDays} ${votingDays === 1 ? "day" : "days"} from now)`
              : ""}
            . If no party has voted yes anywhere, a moderator picks the slot manually.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((iso, index) => {
          const t = tallyFor(index);
          const isSelected = proposal.selectedSlotIndex === index;
          const cardClasses = [
            "rounded-md border p-4 space-y-3",
            isSelected
              ? "border-emerald-300 bg-emerald-50"
              : t.bothYes
                ? "border-emerald-200 bg-emerald-50/40"
                : "border-slate-200 bg-slate-50",
          ].join(" ");
          return (
            <li key={index} className={cardClasses}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                  Slot {index + 1}
                </span>
                {isSelected ? (
                  <span className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Confirmed
                  </span>
                ) : t.bothYes ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                    Both yes
                  </span>
                ) : null}
              </div>
              <div className="text-sm font-semibold text-ink">{formatSlot(iso)}</div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`rounded-md px-2 py-0.5 ${
                    t.c === true
                      ? "bg-emerald-100 text-emerald-800"
                      : t.c === false
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  Claimant: {t.c === true ? "Yes" : t.c === false ? "No" : "?"}
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 ${
                    t.r === true
                      ? "bg-emerald-100 text-emerald-800"
                      : t.r === false
                        ? "bg-rose-100 text-rose-700"
                        : "bg-slate-200 text-slate-600"
                  }`}
                >
                  Respondent: {t.r === true ? "Yes" : t.r === false ? "No" : "?"}
                </span>
              </div>
              {proposal.status === "open" && isParty ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void send(
                        { action: "vote", proposalId: proposal.id, slotIndex: index, available: true },
                        `vote-yes-${index}`,
                      )
                    }
                    disabled={busy !== null}
                    className="flex-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                  >
                    {busy === `vote-yes-${index}` ? "..." : "I can attend"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void send(
                        { action: "vote", proposalId: proposal.id, slotIndex: index, available: false },
                        `vote-no-${index}`,
                      )
                    }
                    disabled={busy !== null}
                    className="flex-1 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    {busy === `vote-no-${index}` ? "..." : "Can't"}
                  </button>
                </div>
              ) : null}
              {proposal.status === "open" && isModeratorOrParty ? (
                <button
                  type="button"
                  onClick={() =>
                    void send({ action: "confirm", proposalId: proposal.id, slotIndex: index }, `confirm-${index}`)
                  }
                  disabled={busy !== null}
                  className={`w-full rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    t.bothYes
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                  } disabled:opacity-60`}
                >
                  {busy === `confirm-${index}` ? "Confirming..." : "Confirm this slot"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>

      {proposal.status === "open" && isModeratorOrParty ? (
        <div className="pt-3 border-t border-slate-200">
          <button
            type="button"
            onClick={() => void send({ action: "generate" }, "generate")}
            disabled={busy !== null}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-60"
          >
            {busy === "generate" ? "Regenerating..." : "Get 5 fresh slots"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
