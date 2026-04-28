"use client";

import { useState } from "react";

type PricingData = {
  balance: number;
  actionCosts: Array<{
    actionCode: string;
    label: string;
    tokens: number;
    isFree: boolean;
  }>;
  packages: Array<{
    packageId: string;
    label: string;
    tokens: number;
    priceUsd: number;
    priceId: string | null;
  }>;
};

type BillingPageProps = {
  pricing: PricingData;
};

export function BillingPage({ pricing }: BillingPageProps) {
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(packageId: string) {
    try {
      setError(null);
      setLoadingPackage(packageId);
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Checkout failed.");
      }
      window.location.href = result.data.url;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Checkout failed.");
    } finally {
      setLoadingPackage(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Billing</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">Token balance and packages</h1>
        <p className="mt-2 text-sm text-slate-600">Phase 4 introduces the token ledger and Stripe checkout flow.</p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-[28px] bg-ink p-6 text-white">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Available balance</div>
        <div className="mt-3 text-5xl font-semibold tracking-tight">{pricing.balance}</div>
        <div className="mt-2 text-sm text-slate-300">Usable for evidence, witnesses, consultants, and expertise requests.</div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Buy tokens</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {pricing.packages.map((pkg) => (
            <div key={pkg.packageId} className="rounded-[28px] border border-slate-200 bg-white p-6">
              <div className="text-sm uppercase tracking-[0.2em] text-slate-400">{pkg.label}</div>
              <div className="mt-4 text-4xl font-semibold tracking-tight text-ink">{pkg.tokens}</div>
              <div className="mt-1 text-sm text-slate-500">tokens</div>
              <div className="mt-6 text-2xl font-semibold text-slate-900">${pkg.priceUsd}</div>
              <button
                type="button"
                disabled={!pkg.priceId || loadingPackage === pkg.packageId}
                onClick={() => void startCheckout(pkg.packageId)}
                className="mt-6 w-full rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingPackage === pkg.packageId ? "Redirecting..." : pkg.priceId ? "Buy package" : "Stripe price missing"}
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">Action costs</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {pricing.actionCosts.map((action) => (
            <div key={action.actionCode} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="font-semibold text-slate-900">{action.label}</div>
              <div className="mt-1 text-sm text-slate-600">{action.actionCode}</div>
              <div className="mt-3 text-sm font-medium text-slate-800">
                {action.isFree
                  ? "Free"
                  : action.actionCode === "appeal_request"
                    ? `${action.tokens} tokens / juror`
                    : `${action.tokens} tokens`}
              </div>
              {action.actionCode === "appeal_request" ? (
                <div className="mt-1 text-xs text-slate-500">
                  Choose 1, 3, 5, or 7 jurors (max 7).
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
