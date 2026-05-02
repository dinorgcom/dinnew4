"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type TokenRow = {
  id: string;
  label: string;
  tokenPrefix: string;
  lastUsedAt: string | Date | null;
  createdAt: string | Date;
};

type ApiTokensFormProps = {
  initialTokens: TokenRow[];
};

export function ApiTokensForm({ initialTokens }: ApiTokensFormProps) {
  const router = useRouter();
  const [tokens, setTokens] = useState<TokenRow[]>(initialTokens);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<{ label: string; plain: string } | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [isPending, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function formatDate(value: string | Date | null) {
    if (!value) return "—";
    const date = typeof value === "string" ? new Date(value) : value;
    return date.toLocaleString();
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!label.trim()) {
      setError("Please enter a label so you can identify this token later.");
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Failed to create token");
        return;
      }

      const created = body.data?.token as TokenRow | undefined;
      const plain = body.data?.plainToken as string | undefined;
      if (!created || !plain) {
        setError("Server did not return the new token");
        return;
      }
      setTokens((current) => [created, ...current]);
      setCreatedToken({ label: created.label, plain });
      setLabel("");
    });
  }

  async function handleRevoke(tokenId: string) {
    if (!confirm("Revoke this token? Any scripts using it will lose access.")) return;
    setError(null);
    setRevokingId(tokenId);
    try {
      const response = await fetch(`/api/settings/api-tokens/${tokenId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body?.error?.message || "Failed to revoke token");
        return;
      }
      setTokens((current) => current.filter((t) => t.id !== tokenId));
      router.refresh();
    } finally {
      setRevokingId(null);
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      // ignore — user can copy manually
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {createdToken ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-emerald-700">
            New token created — copy it now
          </div>
          <p className="mt-1 text-sm text-emerald-900">
            This is the only time you will see <strong>{createdToken.label}</strong> in plain text.
            Store it somewhere safe (a secret manager). You can always revoke it and create a new
            one.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="break-all rounded-md bg-white px-3 py-2 font-mono text-xs text-slate-800">
              {createdToken.plain}
            </code>
            <button
              type="button"
              onClick={() => void copyToClipboard(createdToken.plain)}
              className="rounded-md bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
            >
              {copyState === "copied" ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedToken(null)}
            className="mt-3 text-xs text-emerald-800 underline"
          >
            I have stored the token — dismiss
          </button>
        </div>
      ) : null}

      <form
        onSubmit={handleCreate}
        className="flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-4"
      >
        <label className="flex-1 text-sm">
          <span className="block text-xs uppercase tracking-[0.16em] text-slate-500">
            Token label
          </span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder='e.g. "Maria laptop", "Claimant bot"'
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            maxLength={64}
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isPending ? "Generating..." : "Generate token"}
        </button>
      </form>

      {tokens.length === 0 ? (
        <div className="rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600">
          No API tokens yet.
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Prefix</th>
              <th className="px-3 py-2">Last used</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tokens.map((token) => (
              <tr key={token.id}>
                <td className="px-3 py-3 text-slate-800">{token.label}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">
                  {token.tokenPrefix}…
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  {formatDate(token.lastUsedAt)}
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">
                  {formatDate(token.createdAt)}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    disabled={revokingId === token.id}
                    onClick={() => void handleRevoke(token.id)}
                    className="rounded-md border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 transition hover:border-rose-400 disabled:opacity-60"
                  >
                    {revokingId === token.id ? "Revoking..." : "Revoke"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
