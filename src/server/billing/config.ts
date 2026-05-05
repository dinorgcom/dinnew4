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
  lawyer_create: 95,
  expertise_create: 120,
  audit_request: 10,
  statement_sanitize: 10,
  statement_translate: 5,
  document_translate: 50,
  appeal_request: 250,
  evidence_review_extend_1: 50,
  evidence_review_extend_2: 100,
  evidence_review_extend_3: 200,
  party_approval_extend_1: 50,
  party_approval_extend_2: 100,
  party_approval_extend_3: 200,
} as const;

export const ACTION_LABELS: Record<keyof typeof ACTION_COSTS, string> = {
  claim_create: "Claims",
  evidence_create: "Evidence",
  witness_create: "Witness",
  consultant_create: "Consultant",
  lawyer_create: "Lawyer",
  expertise_create: "Expertise",
  audit_request: "Audit",
  statement_sanitize: "Statement: AI clean-up for arbitration scope",
  statement_translate: "Statement: DeepL translation",
  document_translate: "Document: DeepL translation (PDF / DOCX)",
  appeal_request: "Appeal (per juror; choose 1, 3, 5, or 7 — max 7)",
  evidence_review_extend_1: "Evidence review +14d (1st)",
  evidence_review_extend_2: "Evidence review +14d (2nd)",
  evidence_review_extend_3: "Evidence review +14d (3rd)",
  party_approval_extend_1: "Party approval +7d (1st)",
  party_approval_extend_2: "Party approval +7d (2nd)",
  party_approval_extend_3: "Party approval +7d (3rd)",
};

export const EVIDENCE_REVIEW_EXTENSION_COSTS = [50, 100, 200] as const;
export const EVIDENCE_REVIEW_MAX_EXTENSIONS = EVIDENCE_REVIEW_EXTENSION_COSTS.length;
export const EVIDENCE_REVIEW_INITIAL_DAYS = 14;
export const EVIDENCE_REVIEW_EXTENSION_DAYS = 14;

// Party approval (multi-party) deadlines: same 3-step ladder as evidence
// review extensions, but 7 days each since the base window is 7 days.
export const PARTY_APPROVAL_EXTENSION_COSTS = [50, 100, 200] as const;
export const PARTY_APPROVAL_MAX_EXTENSIONS = PARTY_APPROVAL_EXTENSION_COSTS.length;
export const PARTY_APPROVAL_INITIAL_DAYS = 7;
export const PARTY_APPROVAL_EXTENSION_DAYS = 7;

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

