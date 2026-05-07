"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LawyerSelectScreen } from "@/components/lawyer-select-screen";
import { PreFilingLawyerChat } from "@/components/pre-filing-lawyer-chat";
import type { LawyerProfile } from "@/lib/lawyers";

type FilerRole = "claimant" | "respondent";

type WizardStep =
  | "self-identify"
  | "other-party"
  | "case-name"
  | "claims"
  | "invitation";

type CaseCreationWizardProps = {
  kycVerified: boolean;
  filerName: string;
  filerEmail: string;
  filerNameLocked: boolean;
};

export function CaseCreationWizard({
  kycVerified,
  filerName,
  filerEmail,
  filerNameLocked,
}: CaseCreationWizardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<LawyerProfile | null>(null);

  const [step, setStep] = useState<WizardStep>("self-identify");
  const [filerRole, setFilerRole] = useState<FilerRole>("claimant");
  const [filerNameInput, setFilerNameInput] = useState(filerName);
  const [otherParties, setOtherParties] = useState<string[]>([""]);
  const [caseName, setCaseName] = useState("");
  const [caseLanguage, setCaseLanguage] = useState("en");
  const [includeClaims, setIncludeClaims] = useState(false);
  const [statementText, setStatementText] = useState("");
  const [otherPartyEmail, setOtherPartyEmail] = useState("");
  const [otherPartyPhone, setOtherPartyPhone] = useState("");

  const otherSideLabel = filerRole === "claimant" ? "respondent" : "claimant";
  const filerLabel = filerRole === "claimant" ? "claimant" : "respondent";

  const suggestedCaseName = useMemo(() => {
    const me = filerNameInput.trim() || (filerRole === "claimant" ? "Claimant" : "Respondent");
    const them = otherParties[0]?.trim() || (filerRole === "claimant" ? "Respondent" : "Claimant");
    return filerRole === "claimant" ? `${me} vs ${them}` : `${them} vs ${me}`;
  }, [filerNameInput, filerRole, otherParties]);

  // The shared "draft case data" object the Guide chat sees, kept in sync
  // with whatever the user has entered so far.
  const draftCaseData = useMemo(
    () => ({
      filerRole,
      filerName: filerNameInput,
      otherParties: otherParties.filter(Boolean),
      caseName: caseName || suggestedCaseName,
      statement: includeClaims ? statementText : "",
    }),
    [filerRole, filerNameInput, otherParties, caseName, suggestedCaseName, includeClaims, statementText],
  );

  const stepIndex = (() => {
    const order: WizardStep[] = [
      "self-identify",
      "other-party",
      "case-name",
      ...(filerRole === "claimant" && includeClaims ? (["claims"] as const) : []),
      "invitation",
    ];
    const idx = order.indexOf(step);
    return { idx, total: order.length };
  })();

  function next() {
    setError(null);
    if (step === "self-identify") {
      setStep("other-party");
      return;
    }
    if (step === "other-party") {
      const valid = otherParties.some((n) => n.trim().length > 0);
      if (!valid) {
        setError(`Enter at least one ${otherSideLabel} name.`);
        return;
      }
      setStep("case-name");
      return;
    }
    if (step === "case-name") {
      if (filerRole === "claimant" && includeClaims) {
        setStep("claims");
      } else {
        setStep("invitation");
      }
      return;
    }
    if (step === "claims") {
      setStep("invitation");
      return;
    }
  }

  function back() {
    setError(null);
    if (step === "other-party") setStep("self-identify");
    else if (step === "case-name") setStep("other-party");
    else if (step === "claims") setStep("case-name");
    else if (step === "invitation") {
      if (filerRole === "claimant" && includeClaims) setStep("claims");
      else setStep("case-name");
    }
  }

  async function submit(saveMode: "draft" | "file") {
    setError(null);

    const filerN = filerNameInput.trim();
    const otherN = otherParties[0]?.trim() ?? "";
    if (!filerN) {
      setError("Your name is required.");
      return;
    }
    if (!otherN) {
      setError(`At least one ${otherSideLabel} name is required.`);
      return;
    }
    if (saveMode === "file" && !otherPartyEmail.trim()) {
      setError(`We need the ${otherSideLabel}'s email to send the invitation.`);
      return;
    }

    // Map the wizard's filer/other concepts onto the underlying
    // claimant/respondent fields the API expects.
    const claimantName = filerRole === "claimant" ? filerN : otherN;
    const claimantEmail = filerRole === "claimant" ? filerEmail : otherPartyEmail.trim();
    const claimantPhone = filerRole === "claimant" ? null : otherPartyPhone.trim() || null;
    const respondentName = filerRole === "respondent" ? filerN : otherN;
    const respondentEmail = filerRole === "respondent" ? filerEmail : otherPartyEmail.trim();
    const respondentPhone = filerRole === "respondent" ? null : otherPartyPhone.trim() || null;

    const payload = {
      description: caseName || suggestedCaseName,
      category: "commercial",
      priority: "medium",
      language: caseLanguage,
      claimantName,
      claimantEmail,
      claimantPhone,
      respondentName,
      respondentEmail,
      respondentPhone,
      claimAmount: null,
      currency: "USD",
      claimantClaims: [],
      respondentClaims: [],
      claimantStatement:
        filerRole === "claimant" && includeClaims && statementText.trim()
          ? statementText.trim()
          : null,
      respondentStatement: null,
      claimantLawyerKey: filerRole === "claimant" ? selectedGuide?.id ?? null : null,
      saveMode,
    };

    startTransition(async () => {
      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.error?.code === "KYC_REQUIRED") {
          const draftCaseId: string | undefined = result.error?.details?.draftCaseId;
          const returnTo = draftCaseId
            ? `/cases/${draftCaseId}/edit?kycVerified=1`
            : "/cases/new";
          router.push(`/verify/start?returnTo=${encodeURIComponent(returnTo)}` as Route);
          return;
        }
        setError(result.error?.message || "Failed to save case.");
        return;
      }
      const redirectTo = `/cases/${result.data.id}` as Route;
      router.push(redirectTo);
      router.refresh();
    });
  }

  // Step 0 — pick a Guide. Same screen as before, but the labels are now
  // DIN.ORG Guide instead of "lawyer".
  if (!selectedGuide) {
    return <LawyerSelectScreen partyRole="claimant" onSelect={setSelectedGuide} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
              File a new case · Step {stepIndex.idx + 1} of {stepIndex.total}
            </div>
            <button
              type="button"
              onClick={() => setSelectedGuide(null)}
              className="text-xs font-medium text-slate-500 underline hover:text-slate-700"
            >
              Change Guide
            </button>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {step === "self-identify" && "Who are you on this case?"}
            {step === "other-party" && `Name of the ${otherSideLabel}${otherParties.length > 1 ? "s" : ""}`}
            {step === "case-name" && "Case name"}
            {step === "claims" && "What are you asking for?"}
            {step === "invitation" && "Invite the other side"}
          </h1>
        </header>

        {error ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {/* STEP: SELF-IDENTIFY */}
        {step === "self-identify" ? (
          <section className="space-y-5 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              You can either bring a claim against another party, or proactively initiate
              arbitration as the responding side. The platform supports both.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFilerRole("claimant")}
                className={`rounded-md border p-5 text-left transition ${
                  filerRole === "claimant"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-base font-semibold">I am the Claimant</div>
                <div
                  className={`mt-1 text-xs leading-6 ${
                    filerRole === "claimant" ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  I have a claim against the other side.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setFilerRole("respondent")}
                className={`rounded-md border p-5 text-left transition ${
                  filerRole === "respondent"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-base font-semibold">I am the Respondent</div>
                <div
                  className={`mt-1 text-xs leading-6 ${
                    filerRole === "respondent" ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  I want to start arbitration on a dispute the other side raised.
                </div>
              </button>
            </div>
            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                Your name
                {filerNameLocked ? (
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                    Verified via Stripe Identity
                  </span>
                ) : null}
              </span>
              <input
                value={filerNameInput}
                readOnly={filerNameLocked}
                disabled={filerNameLocked}
                onChange={(e) => setFilerNameInput(e.target.value)}
                className={
                  filerNameLocked
                    ? "w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600"
                    : "w-full rounded-md border border-slate-300 px-4 py-3 text-sm text-slate-800"
                }
              />
            </label>
          </section>
        ) : null}

        {/* STEP: OTHER PARTY NAME(S) */}
        {step === "other-party" ? (
          <section className="space-y-5 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              Enter just the name(s) of the {otherSideLabel}{otherParties.length > 1 ? "s" : ""}.
              You can add more details later. If there are multiple {otherSideLabel}s, click
              "Add another" — they will all be invited together.
            </p>
            <div className="space-y-3">
              {otherParties.map((name, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOtherParties((cur) => cur.map((n, i) => (i === idx ? v : n)));
                    }}
                    placeholder={`${otherSideLabel.charAt(0).toUpperCase() + otherSideLabel.slice(1)} ${idx + 1} full name`}
                    className="flex-1 rounded-md border border-slate-300 px-4 py-3 text-sm"
                  />
                  {otherParties.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setOtherParties((cur) => cur.filter((_, i) => i !== idx))
                      }
                      className="rounded-md border border-slate-300 px-3 text-xs text-slate-600 hover:border-rose-300 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setOtherParties((cur) => [...cur, ""])}
                className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-600 hover:border-slate-400"
              >
                + Add another {otherSideLabel}
              </button>
            </div>
          </section>
        ) : null}

        {/* STEP: CASE NAME */}
        {step === "case-name" ? (
          <section className="space-y-5 rounded-md border border-slate-200 bg-white p-6">
            <div className="rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600">
              The case number is generated automatically when you send the invitation.
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Case name</span>
              <input
                value={caseName}
                onChange={(e) => setCaseName(e.target.value)}
                placeholder={suggestedCaseName}
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
              <span className="block text-xs text-slate-500">
                Suggested: <em>{suggestedCaseName}</em>. Leave blank to use it.
              </span>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Case language</span>
              <select
                value={caseLanguage}
                onChange={(e) => setCaseLanguage(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm"
              >
                <option value="en">English</option>
                <option value="de">Deutsch (German)</option>
                <option value="fr">Français (French)</option>
                <option value="es">Español (Spanish)</option>
                <option value="it">Italiano (Italian)</option>
                <option value="pt">Português (Portuguese)</option>
                <option value="nl">Nederlands (Dutch)</option>
                <option value="pl">Polski (Polish)</option>
              </select>
              <span className="block text-xs text-slate-500">
                Drives AI outputs (clean-up, judgement, audit), notification emails, and document
                translations. Both parties can change it later from the case Overview.
              </span>
            </label>

            {filerRole === "claimant" ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Add claims</div>
                    <p className="mt-1 text-xs text-slate-500">
                      As the claimant you can either spell out what you are asking for now, or
                      invite the other side first and add claims later. Most filers add claims
                      later — it is rarely useful to spell them out before the other side joins.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeClaims}
                    onClick={() => setIncludeClaims((current) => !current)}
                    className={`flex shrink-0 items-center gap-2 rounded-full border px-1.5 py-1 text-xs font-semibold transition ${
                      includeClaims
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                        : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    <span
                      className={`relative h-5 w-9 rounded-full transition ${
                        includeClaims ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      aria-hidden="true"
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                          includeClaims ? "left-4" : "left-0.5"
                        }`}
                      />
                    </span>
                    <span>{includeClaims ? "On" : "Off"}</span>
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {/* STEP: CLAIMS (claimant only, optional) */}
        {step === "claims" ? (
          <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              Write your claim against the {otherSideLabel} in plain language. The {otherSideLabel}
              will see this once they accept the invitation and can post their response below
              your statement on the case page. You can keep editing this after filing.
            </p>
            <textarea
              value={statementText}
              onChange={(e) => setStatementText(e.target.value)}
              rows={12}
              placeholder="Describe what happened, what you are asking for, and why."
              className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm leading-7"
            />
            <p className="text-xs text-slate-500">
              No specific format is required. Be clear about facts, dates, and the relief you are
              seeking.
            </p>
          </section>
        ) : null}

        {/* STEP: INVITATION */}
        {step === "invitation" ? (
          <section className="space-y-5 rounded-md border border-slate-200 bg-white p-6">
            <p className="text-sm text-slate-600">
              We will email an invitation to the {otherSideLabel}. The case is created in draft
              and the proceedings only start once they accept.
            </p>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                {otherSideLabel.charAt(0).toUpperCase() + otherSideLabel.slice(1)} email
              </span>
              <input
                type="email"
                value={otherPartyEmail}
                onChange={(e) => setOtherPartyEmail(e.target.value)}
                placeholder="them@example.com"
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">
                {otherSideLabel.charAt(0).toUpperCase() + otherSideLabel.slice(1)} phone (optional)
              </span>
              <input
                value={otherPartyPhone}
                onChange={(e) => setOtherPartyPhone(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
              />
            </label>
            <div className="rounded-md bg-slate-50 px-4 py-3 text-xs text-slate-600">
              <div className="font-semibold text-slate-700">Summary</div>
              <ul className="mt-2 space-y-1">
                <li>You are the {filerLabel}: <strong>{filerNameInput}</strong></li>
                <li>
                  The {otherSideLabel}{otherParties.length > 1 ? "s" : ""}:{" "}
                  <strong>{otherParties.filter(Boolean).join(", ")}</strong>
                </li>
                <li>
                  Case name: <strong>{caseName || suggestedCaseName}</strong>
                </li>
                {filerRole === "claimant" && includeClaims && statementText.trim() ? (
                  <li>
                    Initial statement: <strong>{statementText.trim().length}</strong> characters
                  </li>
                ) : null}
              </ul>
              {otherParties.filter(Boolean).length > 1 ? (
                <p className="mt-2 text-amber-700">
                  We will create the case with the first {otherSideLabel} as the primary party.
                  You can add the additional co-{otherSideLabel}s on the case page after filing.
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === "self-identify"}
            className="rounded-md border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-40"
          >
            Back
          </button>

          {step !== "invitation" ? (
            <button
              type="button"
              onClick={next}
              className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Continue
            </button>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isPending}
                onClick={() => submit("draft")}
                className="rounded-md border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => submit("file")}
                className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isPending
                  ? "Sending..."
                  : kycVerified
                    ? `Send invitation to the ${otherSideLabel}`
                    : "Verify identity to send invitation"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right-hand DIN.ORG Guide chat sidebar — visible across every wizard
          step. Sticky on lg+ so it stays in view as the user fills in fields. */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <PreFilingLawyerChat lawyerKey={selectedGuide.id} draftCaseData={draftCaseData} />
      </aside>
    </div>
  );
}
