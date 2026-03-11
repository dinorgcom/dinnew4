"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";

type UserBalance = {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  accountStatus: string;
  balance: number;
};

type AdminTokenPageProps = {
  users: UserBalance[];
};

export function AdminTokenPage({ users }: AdminTokenPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    userId: users[0]?.id ?? "",
    targetBalance: users[0]?.balance ?? 0,
    reason: "",
  });

  function onSelectUser(userId: string) {
    const selected = users.find((item) => item.id === userId);
    setForm({
      userId,
      targetBalance: selected?.balance ?? 0,
      reason: "",
    });
  }

  function submit() {
    startTransition(async () => {
      setError(null);
      const response = await fetch("/api/admin/token-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Failed to update balance.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Token adjustments</h1>
      </div>

      <AdminNav />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6">
          <div className="space-y-3">
            <label className="space-y-2 block">
              <span className="text-sm font-medium text-slate-700">User</span>
              <select
                value={form.userId}
                onChange={(event) => onSelectUser(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {(user.fullName || user.email) + ` (${user.balance})`}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 block">
              <span className="text-sm font-medium text-slate-700">Target balance</span>
              <input
                type="number"
                min="0"
                value={form.targetBalance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetBalance: Number(event.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm font-medium text-slate-700">Reason</span>
              <textarea
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={isPending || !form.userId}
              onClick={submit}
              className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              Apply balance
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-slate-900">{user.fullName || user.email}</div>
                  <div className="mt-1 text-sm text-slate-600">{user.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-semibold text-ink">{user.balance}</div>
                  <div className="text-xs uppercase tracking-[0.15em] text-slate-400">{user.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
