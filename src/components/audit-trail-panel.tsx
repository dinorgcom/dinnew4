"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/server/format";

type AuditTrailEntry = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  performedBy: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string | Date;
};

type AuditTrailPanelProps = {
  caseId: string;
};

function eventLabel(entry: AuditTrailEntry) {
  const key = entry.metadataJson?.eventKey;
  if (typeof key === "string") return key.replaceAll("_", " ");
  return entry.type.replaceAll("_", " ");
}

export function AuditTrailPanel({ caseId }: AuditTrailPanelProps) {
  const [entries, setEntries] = useState<AuditTrailEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/cases/${caseId}/audit-trail`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error?.message || "Failed to load audit trail");
        }
        if (mounted) {
          setEntries(result.data?.entries || []);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load audit trail");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [caseId]);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Audit trail</div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Case event log</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Read-only case history with timestamps and actors for evidentiary and procedural events.
          </p>
        </div>
        <a
          href={`/api/cases/${caseId}/audit-trail/export`}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Export PDF
        </a>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Loading audit trail...</div>
        ) : entries.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">No audit events recorded yet.</div>
        ) : (
          entries.map((entry) => {
            const entityTitle = entry.metadataJson?.entityTitle;
            const entityType = entry.metadataJson?.entityType;
            return (
              <article key={entry.id} className="rounded-md border border-slate-100 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-slate-500">{eventLabel(entry)}</div>
                    <div className="mt-1 font-semibold text-slate-900">{entry.title}</div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.14em] text-slate-400">
                    {formatDateTime(String(entry.createdAt || ""))}
                  </div>
                </div>
                {entry.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{entry.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  {entry.performedBy ? <span>Actor: {entry.performedBy}</span> : null}
                  {typeof entityType === "string" ? <span>Record type: {entityType}</span> : null}
                  {typeof entityTitle === "string" ? <span>Record: {entityTitle}</span> : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
