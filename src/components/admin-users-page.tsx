"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/admin-nav";

type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: "user" | "moderator" | "admin";
  accountStatus: "active" | "suspended";
  suspensionReason: string | null;
  balance: number;
  createdAt: string | Date;
};

type AdminUsersPageProps = {
  users: AdminUser[];
};

export function AdminUsersPage({ users }: AdminUsersPageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [forms, setForms] = useState(
    Object.fromEntries(
      users.map((user) => [
        user.id,
        {
          role: user.role,
          accountStatus: user.accountStatus,
          reason: user.suspensionReason || "Administrative access update",
        },
      ]),
    ) as Record<string, { role: AdminUser["role"]; accountStatus: AdminUser["accountStatus"]; reason: string }>,
  );

  function submit(userId: string) {
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forms[userId]),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error?.message || "Failed to update user.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Users and access</h1>
        <p className="mt-2 text-sm text-slate-600">
          Phase 6 adds direct role and suspension controls with audit logging.
        </p>
      </div>

      <AdminNav />

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        {users.map((user) => (
          <section key={user.id} className="rounded-[28px] border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-ink">{user.fullName || user.email}</h2>
                <div className="mt-1 text-sm text-slate-600">{user.email}</div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <span className="rounded-full bg-slate-100 px-3 py-1">{user.role}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">{user.accountStatus}</span>
                  <span className="rounded-full bg-slate-100 px-3 py-1">{user.balance} tokens</span>
                </div>
              </div>

              <button
                type="button"
                disabled={isPending}
                onClick={() => submit(user.id)}
                className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                Save access
              </button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select
                  value={forms[user.id]?.role ?? user.role}
                  onChange={(event) =>
                    setForms((current) => ({
                      ...current,
                      [user.id]: {
                        ...current[user.id],
                        role: event.target.value as AdminUser["role"],
                      },
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                >
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">Account status</span>
                <select
                  value={forms[user.id]?.accountStatus ?? user.accountStatus}
                  onChange={(event) =>
                    setForms((current) => ({
                      ...current,
                      [user.id]: {
                        ...current[user.id],
                        accountStatus: event.target.value as AdminUser["accountStatus"],
                      },
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>

              <label className="space-y-2 md:col-span-3">
                <span className="text-sm font-medium text-slate-700">Reason</span>
                <textarea
                  value={forms[user.id]?.reason ?? ""}
                  onChange={(event) =>
                    setForms((current) => ({
                      ...current,
                      [user.id]: {
                        ...current[user.id],
                        reason: event.target.value,
                      },
                    }))
                  }
                  rows={3}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm"
                />
              </label>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
