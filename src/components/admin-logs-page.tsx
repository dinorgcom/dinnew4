import { AdminNav } from "@/components/admin-nav";

type AdminLog = {
  id: string;
  action: string;
  adminEmail: string | null;
  targetEmail: string | null;
  beforeJson: Record<string, unknown>;
  afterJson: Record<string, unknown>;
  reason: string | null;
  createdAt: string | Date;
};

type AdminLogsPageProps = {
  logs: AdminLog[];
};

export function AdminLogsPage({ logs }: AdminLogsPageProps) {
  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Admin</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Audit log</h1>
        <p className="mt-2 text-sm text-slate-600">
          Recent privileged actions recorded by the rewrite workspace.
        </p>
      </div>

      <AdminNav />

      <div className="space-y-4">
        {logs.length === 0 ? (
          <div className="rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-600">
            No admin actions have been recorded yet.
          </div>
        ) : (
          logs.map((log) => (
            <section key={log.id} className="rounded-md border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{log.action}</div>
                  <h2 className="mt-2 text-lg font-semibold text-ink">
                    {log.adminEmail || "Unknown admin"} {"->"} {log.targetEmail || "Unknown target"}
                  </h2>
                </div>
                <div className="text-sm text-slate-500">
                  {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
                    new Date(log.createdAt),
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-md bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Before</div>
                  <pre className="mt-3 overflow-x-auto text-xs text-slate-700">
                    {JSON.stringify(log.beforeJson, null, 2)}
                  </pre>
                </div>
                <div className="rounded-md bg-slate-50 p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">After</div>
                  <pre className="mt-3 overflow-x-auto text-xs text-slate-700">
                    {JSON.stringify(log.afterJson, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-4 text-sm text-slate-600">{log.reason || "No reason provided."}</div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
