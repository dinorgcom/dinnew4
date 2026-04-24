export type KycStatus = "not_started" | "pending" | "verified" | "requires_input" | "canceled";

export type ResolvedIdentity = {
  display: string;
  alleged: string | null;
  verified: string | null;
  source: "verified" | "alleged" | "unknown";
  diverges: boolean;
  kycStatus: KycStatus | null;
  kycVerifiedAt: Date | null;
};

type KycInfo = {
  status: KycStatus | null;
  verifiedAt: Date | null;
  verifiedFirstName?: string | null;
  verifiedLastName?: string | null;
};

type CaseClaimantInput = {
  claimantName?: string | null;
  claimantNameVerified?: string | null;
  claimantKycVerificationId?: string | null;
};

type CaseRespondentInput = {
  respondentName?: string | null;
  respondentNameAlleged?: string | null;
  respondentNameVerified?: string | null;
  respondentKycVerificationId?: string | null;
};

type WitnessLikeInput = {
  fullName?: string | null;
  originalFullName?: string | null;
  kycVerificationId?: string | null;
};

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getDisplayName(alleged: string | null, verified: string | null): string {
  return verified ?? alleged ?? "Unknown";
}

function compose(alleged: string | null, verified: string | null, kyc: KycInfo | null | undefined): ResolvedIdentity {
  const a = normalize(alleged);
  const v = normalize(verified);
  const source: ResolvedIdentity["source"] = v ? "verified" : a ? "alleged" : "unknown";
  const diverges = !!(a && v && a.toLowerCase() !== v.toLowerCase());
  return {
    display: getDisplayName(a, v),
    alleged: a,
    verified: v,
    source,
    diverges,
    kycStatus: kyc?.status ?? null,
    kycVerifiedAt: kyc?.verifiedAt ?? null,
  };
}

export function resolveCaseClaimant(
  caseRow: CaseClaimantInput,
  joinedKyc?: KycInfo | null,
): ResolvedIdentity {
  const verifiedFromJoin =
    joinedKyc?.status === "verified"
      ? `${joinedKyc.verifiedFirstName ?? ""} ${joinedKyc.verifiedLastName ?? ""}`.trim()
      : null;
  const verified = caseRow.claimantNameVerified ?? (verifiedFromJoin || null);
  return compose(caseRow.claimantName ?? null, verified, joinedKyc ?? null);
}

export function resolveCaseRespondent(
  caseRow: CaseRespondentInput,
  joinedKyc?: KycInfo | null,
): ResolvedIdentity {
  const alleged = caseRow.respondentNameAlleged ?? caseRow.respondentName ?? null;
  const verifiedFromJoin =
    joinedKyc?.status === "verified"
      ? `${joinedKyc.verifiedFirstName ?? ""} ${joinedKyc.verifiedLastName ?? ""}`.trim()
      : null;
  const verified = caseRow.respondentNameVerified ?? (verifiedFromJoin || null);
  return compose(alleged, verified, joinedKyc ?? null);
}

export function resolveWitness(row: WitnessLikeInput, joinedKyc?: KycInfo | null): ResolvedIdentity {
  const verified = joinedKyc?.status === "verified" ? row.fullName ?? null : null;
  const alleged = row.originalFullName ?? row.fullName ?? null;
  return compose(alleged, verified, joinedKyc ?? null);
}

export function resolveConsultant(row: WitnessLikeInput, joinedKyc?: KycInfo | null): ResolvedIdentity {
  const verified = joinedKyc?.status === "verified" ? row.fullName ?? null : null;
  const alleged = row.originalFullName ?? row.fullName ?? null;
  return compose(alleged, verified, joinedKyc ?? null);
}
