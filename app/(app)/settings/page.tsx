import Link from "next/link";
import type { Route } from "next";
import { and, desc, eq, isNull } from "drizzle-orm";
import { ensureAppUser } from "@/server/auth/provision";
import { getTokenBalance } from "@/server/billing/service";
import { isDatabaseConfigured } from "@/server/runtime";
import { getDb } from "@/db/client";
import { serviceTokens, users } from "@/db/schema";
import { NotificationsPrefForm } from "@/components/notifications-pref-form";
import { ApiTokensForm } from "@/components/api-tokens-form";

const PLACEHOLDER_INVOICES: Array<{
  id: string;
  date: string;
  amountUsd: number;
  tokens: number;
  status: "paid" | "pending" | "refunded";
}> = [
  { id: "inv_2026_004", date: "2026-04-22 09:14 UTC", amountUsd: 100, tokens: 100, status: "paid" },
  { id: "inv_2026_003", date: "2026-04-09 14:51 UTC", amountUsd: 400, tokens: 500, status: "paid" },
  { id: "inv_2026_002", date: "2026-03-28 10:02 UTC", amountUsd: 100, tokens: 100, status: "paid" },
];

const PLACEHOLDER_PAYMENT_METHODS: Array<{
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}> = [
  { id: "pm_visa", brand: "Visa", last4: "4242", expiry: "07/29", isDefault: true },
];

export default async function SettingsPage() {
  const appUser = await ensureAppUser();
  const balance = appUser?.id && isDatabaseConfigured() ? await getTokenBalance(appUser.id) : 0;
  let notificationPref: "all" | "necessary_only" = "all";
  let apiTokens: Array<{
    id: string;
    label: string;
    tokenPrefix: string;
    lastUsedAt: Date | null;
    createdAt: Date;
  }> = [];
  if (appUser?.id && isDatabaseConfigured()) {
    const db = getDb();
    const rows = await db
      .select({ pref: users.notificationPref })
      .from(users)
      .where(eq(users.id, appUser.id))
      .limit(1);
    const value = rows[0]?.pref;
    if (value === "necessary_only") notificationPref = "necessary_only";

    // Tolerate the service_tokens table not existing yet (migration 0018
    // may not have been applied on this environment). Failing the whole
    // Settings page over a missing tokens list would block the language,
    // notifications and other sections that work without it.
    try {
      apiTokens = await db
        .select({
          id: serviceTokens.id,
          label: serviceTokens.label,
          tokenPrefix: serviceTokens.tokenPrefix,
          lastUsedAt: serviceTokens.lastUsedAt,
          createdAt: serviceTokens.createdAt,
        })
        .from(serviceTokens)
        .where(and(eq(serviceTokens.userId, appUser.id), isNull(serviceTokens.revokedAt)))
        .orderBy(desc(serviceTokens.createdAt));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("settings: service_tokens query failed (migration not applied?)", err);
      apiTokens = [];
    }
  }

  return (
    <div className="space-y-8 lg:py-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Settings</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Account &amp; preferences</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Manage how you authenticate, pay, and access DIN.ORG programmatically. Some sections
          are placeholders pending live wiring.
        </p>
      </div>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Preferences</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Language</h2>
        <p className="mt-2 text-sm text-slate-600">
          Choose the interface language. Translations roll out progressively.
        </p>
        <form action="/api/settings/language" method="POST" className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-700">
            <span className="sr-only">Language</span>
            <select
              name="language"
              defaultValue="en"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
            >
              <option value="en">English (default)</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </select>
          </label>
          <button
            type="submit"
            disabled
            className="rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500"
            title="Translations ship in a follow-up"
          >
            Save (soon)
          </button>
        </form>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Profile</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Account details</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Name</dt>
            <dd className="text-slate-800">{appUser?.fullName || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</dt>
            <dd className="text-slate-800">{appUser?.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Role</dt>
            <dd className="text-slate-800 capitalize">{appUser?.role || "user"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.16em] text-slate-500">Token balance</dt>
            <dd className="text-slate-800">{balance} tokens</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">API access</div>
          <h2 className="mt-2 text-xl font-semibold text-ink">Personal access tokens</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            Generate a personal access token to act on the case API as yourself
            from scripts, automations, or LLM agents. Every token-based call is
            tagged in the audit trail as <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">via API</code>{" "}
            so the audit trail still tells human and machine actions apart.
          </p>
          <p className="mt-2 max-w-xl text-xs text-slate-500">
            <Link href={"/docs/api" as Route} className="text-rose-700 underline">
              Read the API reference →
            </Link>
          </p>
        </div>
        <div className="mt-4">
          <ApiTokensForm
            initialTokens={apiTokens.map((t) => ({
              id: t.id,
              label: t.label,
              tokenPrefix: t.tokenPrefix,
              lastUsedAt: t.lastUsedAt,
              createdAt: t.createdAt,
            }))}
          />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Payment methods</div>
            <h2 className="mt-2 text-xl font-semibold text-ink">Saved cards</h2>
            <p className="mt-2 text-sm text-slate-600">
              Cards on file are managed by Stripe. Defaults are used for token purchases.
            </p>
          </div>
          <button
            type="button"
            disabled
            className="rounded-md border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-500"
          >
            Manage in Stripe (soon)
          </button>
        </div>
        <ul className="mt-4 space-y-2">
          {PLACEHOLDER_PAYMENT_METHODS.map((method) => (
            <li
              key={method.id}
              className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"
            >
              <div>
                <span className="font-semibold text-slate-900">
                  {method.brand} ····{method.last4}
                </span>
                <span className="ml-2 text-xs text-slate-500">expires {method.expiry}</span>
              </div>
              {method.isDefault ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                  Default
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Invoices &amp; payments</div>
          <h2 className="mt-2 text-xl font-semibold text-ink">Recent invoices</h2>
          <p className="mt-2 text-sm text-slate-600">
            Receipts for token purchases. Click an invoice to download the PDF receipt.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Tokens</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PLACEHOLDER_INVOICES.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-3 py-3 font-mono text-xs text-slate-700">{invoice.id}</td>
                  <td className="px-3 py-3 text-slate-700">{invoice.date}</td>
                  <td className="px-3 py-3 text-slate-700">{invoice.tokens}</td>
                  <td className="px-3 py-3 text-slate-700">${invoice.amountUsd}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                        invoice.status === "paid"
                          ? "bg-emerald-100 text-emerald-800"
                          : invoice.status === "pending"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Sample data — when the live invoice ledger ships, this table will pull from Stripe.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Notifications</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Email alerts</h2>
        <p className="mt-2 text-sm text-slate-600">
          Pick how often DIN.ORG should email you about case events. The
          choice applies to every case you're a participant in.
        </p>
        <div className="mt-4">
          <NotificationsPrefForm initialPref={notificationPref} />
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Security</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Account security</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-700">
          <li className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
            <span>Two-factor authentication</span>
            <span className="text-xs text-slate-500">Managed via Clerk</span>
          </li>
          <li className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
            <span>Active sessions</span>
            <span className="text-xs text-slate-500">Managed via Clerk</span>
          </li>
          <li className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
            <span>Identity verification (KYC)</span>
            <Link
              href={"/verify/start" as Route}
              className="text-xs font-semibold text-signal hover:text-teal-800"
            >
              Manage →
            </Link>
          </li>
        </ul>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Danger zone</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Close account</h2>
        <p className="mt-2 text-sm text-slate-600">
          Permanently delete your DIN.ORG account, balances, and all linked records. This action is irreversible.
        </p>
        <button
          type="button"
          disabled
          className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600"
          title="Account deletion ships in a follow-up"
        >
          Delete account (soon)
        </button>
      </section>
    </div>
  );
}
