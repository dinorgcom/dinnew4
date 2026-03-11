export const TOKEN_PACKAGES = [
  {
    packageId: "starter",
    label: "Starter",
    tokens: 100,
    priceUsd: 100,
    priceEnvKey: "STRIPE_PRICE_STARTER" as const,
  },
  {
    packageId: "pro",
    label: "Pro",
    tokens: 500,
    priceUsd: 400,
    priceEnvKey: "STRIPE_PRICE_PRO" as const,
  },
  {
    packageId: "enterprise",
    label: "Enterprise",
    tokens: 1000,
    priceUsd: 700,
    priceEnvKey: "STRIPE_PRICE_ENTERPRISE" as const,
  },
] as const;

export const ACTION_COSTS = {
  claim_create: 0,
  evidence_create: 15,
  witness_create: 75,
  consultant_create: 95,
  expertise_create: 120,
  appeal_request: 450,
} as const;

export const ACTION_LABELS: Record<keyof typeof ACTION_COSTS, string> = {
  claim_create: "Claims",
  evidence_create: "Evidence",
  witness_create: "Witness",
  consultant_create: "Consultant",
  expertise_create: "Expertise",
  appeal_request: "Appeal",
};

export type ActionCode = keyof typeof ACTION_COSTS;

export function getActionCost(actionCode: string | null | undefined) {
  if (!actionCode) {
    return null;
  }
  return ACTION_COSTS[actionCode as ActionCode] ?? null;
}

export function getPackageById(packageId: string) {
  return TOKEN_PACKAGES.find((pkg) => pkg.packageId === packageId) ?? null;
}

