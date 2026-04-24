import type { ResolvedIdentity } from "@/server/identity/resolve";

type Variant = "inline" | "header" | "list";

type Props = {
  identity: ResolvedIdentity;
  variant?: Variant;
  showBadge?: boolean;
  showDriftHint?: boolean;
  className?: string;
};

function nameClass(variant: Variant) {
  switch (variant) {
    case "header":
      return "text-2xl font-semibold text-slate-900";
    case "list":
      return "text-sm font-medium text-slate-900";
    case "inline":
    default:
      return "font-medium text-slate-900";
  }
}

function hintClass(variant: Variant) {
  switch (variant) {
    case "header":
      return "text-sm text-slate-500";
    case "list":
      return "text-xs text-slate-500";
    case "inline":
    default:
      return "text-xs text-slate-500";
  }
}

export function VerifiedName({
  identity,
  variant = "inline",
  showBadge = true,
  showDriftHint = true,
  className,
}: Props) {
  const verifiedBadge =
    showBadge && identity.source === "verified" ? (
      <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        Verified
      </span>
    ) : null;

  const drift =
    showDriftHint && identity.diverges && identity.verified ? (
      <div className={hintClass(variant)}>Verified as: {identity.verified}</div>
    ) : null;

  return (
    <span className={className ?? "inline-flex flex-col"}>
      <span className="inline-flex items-center">
        <span className={nameClass(variant)}>{identity.display}</span>
        {verifiedBadge}
      </span>
      {drift}
    </span>
  );
}
