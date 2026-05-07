"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { upload as blobUpload } from "@vercel/blob/client";
import { ACTION_COSTS } from "@/server/billing/config";
import { formatTokenCost } from "@/lib/utils";

type PleadingSlot = {
  side: "claimant" | "respondent";
  round: 1 | 2;
  label: string;
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  filePathname: string | null;
  translationUrl: string | null;
  translationName: string | null;
  translationLang: string | null;
  lockedAt: string | Date | null;
  reachable: boolean;
  exists: boolean;
};

type SanitizeResult = {
  side: "claimant" | "respondent";
  round: 1 | 2;
  sanitized: string;
  removed: Array<{ passage: string; reason: string; matched: boolean }>;
  note: string;
};

type TranslationResult = {
  side: "claimant" | "respondent";
  round: 1 | 2;
  text: string;
  detectedSourceLang: string;
  targetLang: string;
};

type PleadingsPanelProps = {
  caseId: string;
  caseRole: string | null;
  caseLanguage: string;
  claimantName: string | null;
  respondentName: string | null;
  pleadings: PleadingSlot[];
};

function formatDate(value: string | Date | null) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function PleadingsPanel({
  caseId,
  caseRole,
  caseLanguage,
  claimantName,
  respondentName,
  pleadings,
}: PleadingsPanelProps) {
  const router = useRouter();
  // Per-slot draft text. Keyed by `side:round`.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const slot of pleadings) init[`${slot.side}:${slot.round}`] = slot.text ?? "";
    return init;
  });
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [sanitizingKey, setSanitizingKey] = useState<string | null>(null);
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const [translatingDocKey, setTranslatingDocKey] = useState<string | null>(null);
  const [sanitizeResult, setSanitizeResult] = useState<SanitizeResult | null>(null);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lang = caseLanguage.toLowerCase();
  const langUpper = lang.toUpperCase();

  function key(side: "claimant" | "respondent", round: 1 | 2) {
    return `${side}:${round}`;
  }

  async function postSave(slot: PleadingSlot, body: unknown) {
    const response = await fetch(
      `/api/cases/${caseId}/pleadings/${slot.round}/${slot.side}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || "Save failed");
    }
  }

  async function saveSlot(slot: PleadingSlot) {
    setError(null);
    setSavingKey(key(slot.side, slot.round));
    try {
      await postSave(slot, { text: drafts[key(slot.side, slot.round)] ?? "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
    }
  }

  async function submitSlot(slot: PleadingSlot) {
    if (
      !confirm(
        `Final submit ${slot.label}? After this no further changes can be made to this pleading.`,
      )
    )
      return;
    setError(null);
    setSubmittingKey(key(slot.side, slot.round));
    try {
      // Save the latest draft first so anything in the textarea is captured.
      await postSave(slot, { text: drafts[key(slot.side, slot.round)] ?? "" });
      const response = await fetch(
        `/api/cases/${caseId}/pleadings/${slot.round}/${slot.side}/submit`,
        { method: "POST" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error?.message || "Submit failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmittingKey(null);
    }
  }

  async function uploadFile(slot: PleadingSlot, file: File) {
    setError(null);
    setUploadingKey(key(slot.side, slot.round));
    try {
      const MAX_BYTES = 100 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        setError("File too large — 100 MB maximum.");
        return;
      }
      const blob = await blobUpload(file.name || "pleading.pdf", file, {
        access: "private",
        handleUploadUrl: `/api/cases/${caseId}/uploads/token`,
        clientPayload: JSON.stringify({ category: "pleading" }),
      });
      await postSave(slot, {
        text: drafts[key(slot.side, slot.round)] ?? "",
        attachment: {
          url: blob.url,
          pathname: blob.pathname,
          fileName: file.name,
          contentType: file.type || null,
          size: file.size || null,
        },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingKey(null);
      const ref = fileInputRefs.current[key(slot.side, slot.round)];
      if (ref) ref.value = "";
    }
  }

  async function removeFile(slot: PleadingSlot) {
    if (!confirm("Remove the attached document?")) return;
    setError(null);
    setSavingKey(key(slot.side, slot.round));
    try {
      await postSave(slot, {
        text: drafts[key(slot.side, slot.round)] ?? "",
        removeAttachment: true,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setSavingKey(null);
    }
  }

  async function runSanitize(slot: PleadingSlot) {
    setError(null);
    setSanitizingKey(key(slot.side, slot.round));
    setSanitizeResult(null);
    try {
      const response = await fetch(
        `/api/cases/${caseId}/pleadings/${slot.round}/${slot.side}/sanitize`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Sanitize failed");
        return;
      }
      const data = body?.data as
        | {
            sanitized: string;
            removed: Array<{ passage: string; reason: string; matched: boolean }>;
            note: string;
          }
        | undefined;
      if (!data) {
        setError("Sanitize returned no result");
        return;
      }
      setSanitizeResult({
        side: slot.side,
        round: slot.round,
        sanitized: data.sanitized || "",
        removed: data.removed || [],
        note: data.note || "",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sanitize failed");
    } finally {
      setSanitizingKey(null);
    }
  }

  function applySanitize() {
    if (!sanitizeResult) return;
    setDrafts((current) => ({
      ...current,
      [`${sanitizeResult.side}:${sanitizeResult.round}`]: sanitizeResult.sanitized,
    }));
    setSanitizeResult(null);
  }

  async function runTranslateText(slot: PleadingSlot) {
    setError(null);
    setTranslatingKey(key(slot.side, slot.round));
    setTranslationResult(null);
    try {
      const response = await fetch(
        `/api/cases/${caseId}/pleadings/${slot.round}/${slot.side}/translate`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Translation failed");
        return;
      }
      const data = body?.data as
        | { translatedText: string; detectedSourceLang: string; targetLang: string }
        | undefined;
      if (!data) return;
      setTranslationResult({
        side: slot.side,
        round: slot.round,
        text: data.translatedText,
        detectedSourceLang: data.detectedSourceLang,
        targetLang: data.targetLang,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
    } finally {
      setTranslatingKey(null);
    }
  }

  async function runTranslateDocument(slot: PleadingSlot) {
    setError(null);
    setTranslatingDocKey(key(slot.side, slot.round));
    try {
      const response = await fetch(
        `/api/cases/${caseId}/pleadings/${slot.round}/${slot.side}/translate-document`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.message || "Document translation failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document translation failed");
    } finally {
      setTranslatingDocKey(null);
    }
  }

  function renderSlot(slot: PleadingSlot, idx: number) {
    const k = key(slot.side, slot.round);
    const isClaimantSide = slot.side === "claimant";
    const eyebrowClass = isClaimantSide ? "text-rose-600" : "text-indigo-600";
    const sideName = isClaimantSide ? claimantName : respondentName;
    const isLocked = !!slot.lockedAt;
    const canEdit = caseRole === slot.side && !isLocked && slot.reachable;
    const draft = drafts[k] ?? "";
    const dirty = canEdit && draft !== (slot.text ?? "");
    const original = slot.text ?? "";
    const fileDownloadHref = slot.fileUrl
      ? (`/api/files/pleadings/${
          // The file proxy needs the pleadings row id, which we don't have
          // directly here. Fall back to the case-level URL by side+round
          // — not implemented; use case file proxy instead.
          ""
        }` as Route)
      : null;
    void fileDownloadHref; // unused in this minimal pass

    // Predecessor not done yet — show a waiting state.
    if (!slot.reachable) {
      const previousSlot = idx > 0 ? null : null;
      const prevLabel = idx > 0 ? "the previous pleading" : "";
      return (
        <section key={k} className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div
                className={`text-xs font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}
              >
                {slot.label}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-700">{sideName || "—"}</div>
            </div>
            <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
              Waiting
            </span>
          </div>
          <p className="text-xs text-slate-500">
            This slot opens once {prevLabel || "the previous pleading"} has been finalized.
          </p>
          {void previousSlot}
        </section>
      );
    }

    return (
      <section key={k} className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${eyebrowClass}`}>
              {slot.label}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{sideName || "—"}</div>
          </div>
          {isLocked ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              Finalized · {formatDate(slot.lockedAt)}
            </span>
          ) : canEdit ? (
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Editable — your turn
            </span>
          ) : (
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              {sideName || "Other side"}'s turn
            </span>
          )}
        </div>

        {canEdit ? (
          <textarea
            value={draft}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [k]: event.target.value }))
            }
            placeholder={
              isClaimantSide
                ? slot.round === 1
                  ? "State the claim against the respondent."
                  : "Reply to the respondent's response."
                : slot.round === 1
                  ? "Respond to the claimant's claim."
                  : "Reply to the claimant's reply (rejoinder)."
            }
            rows={10}
            className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm leading-7"
          />
        ) : original.trim().length === 0 && !slot.fileUrl ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-500">
            {isLocked ? "Finalized as empty." : "Nothing posted yet."}
          </div>
        ) : original.trim().length > 0 ? (
          <div className="whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-7 text-slate-700">
            {original}
          </div>
        ) : null}

        {slot.fileUrl ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="font-medium text-slate-700">
              Attached: {slot.fileName || "document"}
            </span>
            {slot.filePathname ? (
              <a
                href={slot.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-slate-300 px-2 py-0.5 font-medium text-slate-700 hover:border-slate-400"
              >
                Open original
              </a>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                disabled={savingKey === k || uploadingKey === k}
                onClick={() => void removeFile(slot)}
                className="rounded-md border border-rose-300 px-2 py-0.5 font-medium text-rose-700 hover:border-rose-400 disabled:opacity-60"
              >
                Remove
              </button>
            ) : null}
            {slot.translationUrl ? (
              <span className="ml-2 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                Translation ({(slot.translationLang || "?").toUpperCase()}):{" "}
                {slot.translationName || "translated.pdf"}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Sanitize result (inline, when present, only on its slot) */}
        {sanitizeResult &&
        sanitizeResult.side === slot.side &&
        sanitizeResult.round === slot.round ? (
          <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                AI clean-up suggestion
              </div>
              <button
                type="button"
                onClick={() => setSanitizeResult(null)}
                className="text-xs text-slate-600 underline hover:text-slate-800"
              >
                Discard
              </button>
            </div>
            {sanitizeResult.note ? (
              <div className="text-xs text-slate-700">{sanitizeResult.note}</div>
            ) : null}
            {sanitizeResult.removed.length > 0 ? (
              <ul className="space-y-2">
                {sanitizeResult.removed.map((entry, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-slate-200 bg-white p-3 text-xs leading-6"
                  >
                    <div className="text-slate-700">
                      <span
                        className={`font-semibold ${entry.matched ? "text-rose-700" : "text-amber-700"}`}
                      >
                        {entry.matched ? "Removed:" : "Suggested (not matched):"}
                      </span>{" "}
                      <em>{entry.passage}</em>
                    </div>
                    <div className="mt-1 text-slate-600">
                      <span className="font-semibold">Reason:</span> {entry.reason}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md bg-white px-3 py-2 text-xs text-slate-600">
                Nothing was flagged — your statement is in scope for arbitration.
              </div>
            )}
            {sanitizeResult.removed.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={applySanitize}
                  className="rounded-md bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                >
                  Apply to text field
                </button>
                <span className="text-xs text-slate-500">
                  Click <strong>Save</strong> after applying.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Translation result (text) */}
        {translationResult &&
        translationResult.side === slot.side &&
        translationResult.round === slot.round ? (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-[0.18em] text-emerald-800">
                Translation{" "}
                {translationResult.detectedSourceLang
                  ? `${translationResult.detectedSourceLang} → ${translationResult.targetLang.toUpperCase()}`
                  : `→ ${translationResult.targetLang.toUpperCase()}`}{" "}
                (DeepL)
              </div>
              <button
                type="button"
                onClick={() => setTranslationResult(null)}
                className="text-xs text-slate-600 underline hover:text-slate-800"
              >
                Hide
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded-md bg-white p-3 leading-7 text-slate-800">
              {translationResult.text}
            </div>
          </div>
        ) : null}

        {/* Action row */}
        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={(el) => {
                  fileInputRefs.current[k] = el;
                }}
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadFile(slot, file);
                }}
              />
              <button
                type="button"
                disabled={savingKey === k || uploadingKey === k || sanitizingKey === k}
                onClick={() => fileInputRefs.current[k]?.click()}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {uploadingKey === k
                  ? "Uploading..."
                  : slot.fileUrl
                    ? "Replace document (PDF / DOC / DOCX)"
                    : "Attach document (PDF / DOC / DOCX)"}
              </button>
              <button
                type="button"
                disabled={
                  savingKey === k ||
                  uploadingKey === k ||
                  sanitizingKey === k ||
                  (!original.trim() && !slot.fileUrl)
                }
                onClick={() => void runSanitize(slot)}
                className="rounded-md border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 transition hover:border-violet-400 disabled:opacity-60"
              >
                {sanitizingKey === k
                  ? "AI cleaning up..."
                  : `AI clean-up (${formatTokenCost(ACTION_COSTS.statement_sanitize)})`}
              </button>
              {original.trim() ? (
                <button
                  type="button"
                  disabled={translatingKey !== null}
                  onClick={() => void runTranslateText(slot)}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-400 disabled:opacity-60"
                >
                  {translatingKey === k
                    ? "Translating..."
                    : `Translate text to ${langUpper} (${formatTokenCost(ACTION_COSTS.statement_translate)})`}
                </button>
              ) : null}
              {slot.fileUrl ? (
                <button
                  type="button"
                  disabled={translatingDocKey !== null}
                  onClick={() => void runTranslateDocument(slot)}
                  className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:border-emerald-400 disabled:opacity-60"
                >
                  {translatingDocKey === k
                    ? `Translating to ${langUpper}...`
                    : slot.translationLang === lang
                      ? `Re-translate document to ${langUpper}`
                      : `Translate document to ${langUpper} (${formatTokenCost(ACTION_COSTS.document_translate)})`}
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!dirty || savingKey === k}
                onClick={() => void saveSlot(slot)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
              >
                {savingKey === k ? "Saving..." : "Save draft"}
              </button>
              <button
                type="button"
                disabled={submittingKey !== null}
                onClick={() => void submitSlot(slot)}
                className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {submittingKey === k ? "Submitting..." : "Final submit"}
              </button>
            </div>
          </div>
        ) : null}

        {isLocked && slot.translationUrl ? (
          <Link
            href={`/api/files/case/${caseId}` as Route}
            className="text-xs text-emerald-700 underline"
          >
            (translation available)
          </Link>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          Pleadings exchange follows the standard <strong>two-round</strong> structure:
          claimant files the claim, respondent answers, claimant replies (Replik), respondent
          rejoins (Duplik). Each pleading is editable and saveable as a draft until you click{" "}
          <strong>Final submit</strong> — after that, the pleading is locked and the next slot
          opens for the other side.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {pleadings.map((slot, idx) => renderSlot(slot, idx))}
    </div>
  );
}
