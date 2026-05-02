"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initialPref: "all" | "necessary_only";
};

export function NotificationsPrefForm({ initialPref }: Props) {
  const router = useRouter();
  const [pref, setPref] = useState<"all" | "necessary_only">(initialPref);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(next: "all" | "necessary_only") {
    setError(null);
    setPref(next);
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pref: next }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error?.message || "Failed");
      }
      setSavedAt(Date.now());
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
      setPref(initialPref);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save("all")}
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            pref === "all"
              ? "bg-ink text-white"
              : "border border-slate-300 text-slate-700 hover:border-slate-400"
          }`}
        >
          All notifications
        </button>
        <button
          type="button"
          onClick={() => void save("necessary_only")}
          disabled={pending}
          className={`rounded-md px-4 py-2 text-sm font-semibold transition ${
            pref === "necessary_only"
              ? "bg-ink text-white"
              : "border border-slate-300 text-slate-700 hover:border-slate-400"
          }`}
        >
          Necessary only
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {pref === "all"
          ? "You'll get an email for every event on your cases (new evidence, witnesses, consultants, lawyers, deadline reminders, settlement offers, etc.)."
          : "You'll only get emails for events that block you from progressing — deadline reminders for items you must respond to, and final outcomes."}
      </p>
      {savedAt ? (
        <p className="text-xs text-emerald-700">Saved.</p>
      ) : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
