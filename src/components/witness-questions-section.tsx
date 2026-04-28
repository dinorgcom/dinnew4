"use client";

import { useEffect, useState } from "react";

type WitnessQuestion = {
  id: string;
  questionText: string;
  source: string;
  createdAt: string | Date;
};

type Props = {
  caseId: string;
  witnessId: string;
  caseRole: "claimant" | "respondent";
};

export function WitnessQuestionsSection({ caseId, witnessId, caseRole }: Props) {
  const [questions, setQuestions] = useState<WitnessQuestion[] | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch(
        `/api/cases/${caseId}/witnesses/${witnessId}/questions`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Failed to load");
      setQuestions(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load questions");
      setQuestions([]);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, witnessId]);

  async function add(text: string, source: "manual" | "ai_suggested" = "manual") {
    setAdding(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cases/${caseId}/witnesses/${witnessId}/questions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionText: text.trim(), source }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Failed to add");
      setQuestions((prev) => (prev ? [...prev, result.data] : [result.data]));
      if (source === "manual") setDraft("");
      setSuggestions((prev) => prev.filter((s) => s.trim() !== text.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const response = await fetch(
        `/api/cases/${caseId}/witnesses/${witnessId}/questions/${id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error?.message || "Failed to delete");
      }
      setQuestions((prev) => prev?.filter((q) => q.id !== id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function suggest() {
    setSuggesting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/cases/${caseId}/witnesses/${witnessId}/questions/suggest`,
        { method: "POST" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Failed to get suggestions");
      setSuggestions(result.data.questions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
            My questions for this witness
          </div>
          <p className="mt-1 text-xs text-amber-800/80">
            Private to the {caseRole}. Your questions are not shown to the other party.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void suggest()}
          disabled={suggesting}
          className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
        >
          {suggesting ? "Asking lawyer..." : "Ask my lawyer"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      {questions && questions.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {questions.map((q, index) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-3 rounded-md bg-white p-3 text-sm text-slate-800"
            >
              <div className="flex-1">
                <span className="mr-2 text-xs font-semibold text-amber-700">
                  {index + 1}.
                </span>
                {q.questionText}
                {q.source === "ai_suggested" ? (
                  <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                    AI
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void remove(q.id)}
                className="text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      ) : questions ? (
        <div className="mt-3 text-xs text-amber-800/70">No questions yet.</div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold text-amber-800">
            Lawyer suggestions
          </div>
          {suggestions.map((s, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800"
            >
              <div className="flex-1">{s}</div>
              <button
                type="button"
                onClick={() => void add(s, "ai_suggested")}
                disabled={adding}
                className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                Add
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim().length >= 5) {
              e.preventDefault();
              void add(draft);
            }
          }}
          placeholder="Add your own question..."
          className="flex-1 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm focus:border-amber-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void add(draft)}
          disabled={adding || draft.trim().length < 5}
          className="rounded-md bg-ink px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>
    </div>
  );
}
