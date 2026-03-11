"use client";

import { useState } from "react";

type LawyerMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
};

type LawyerChatPanelProps = {
  caseId: string;
  canUseChat: boolean;
  initialConversation: {
    lawyerPersonality?: string | null;
    contextSummary?: string | null;
    messagesJson?: Record<string, unknown>[] | null;
  } | null;
};

export function LawyerChatPanel({ caseId, canUseChat, initialConversation }: LawyerChatPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [personality, setPersonality] = useState(initialConversation?.lawyerPersonality || "strategic");
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState(initialConversation);
  const messages = (conversation?.messagesJson || []).flatMap((item) => {
    if (
      typeof item.role === "string"
      && typeof item.content === "string"
      && typeof item.createdAt === "string"
      && (item.role === "system" || item.role === "user" || item.role === "assistant")
    ) {
      return [
        {
          role: item.role,
          content: item.content,
          createdAt: item.createdAt,
        } as LawyerMessage,
      ];
    }

    return [];
  });

  async function send() {
    try {
      setError(null);
      setIsSending(true);
      const response = await fetch(`/api/cases/${caseId}/lawyer-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, personality }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to continue chat.");
      }
      setConversation(result.data);
      setMessage("");
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to continue chat.");
    } finally {
      setIsSending(false);
    }
  }

  if (!canUseChat) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Lawyer chat is only available to the claimant or respondent on this case.
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI counsel</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Lawyer chat</h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Ask for strategy, framing, and missing-proof guidance tied to this case file.
            </p>
          </div>
          <select
            value={personality}
            onChange={(event) => setPersonality(event.target.value)}
            className="rounded-full border border-slate-300 px-4 py-3 text-sm"
          >
            <option value="strategic">Strategic</option>
            <option value="concise">Concise</option>
            <option value="assertive">Assertive</option>
          </select>
        </div>

        {conversation?.contextSummary ? (
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            <div className="text-xs uppercase tracking-[0.16em] text-slate-500">Working summary</div>
            <p className="mt-2 leading-7">{conversation.contextSummary}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6">
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              No messages yet. Ask about strategy, evidence gaps, negotiation framing, or what to do next.
            </div>
          ) : (
            messages.map((item, index) => (
              <div
                key={`${item.createdAt}-${index}`}
                className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                  item.role === "assistant"
                    ? "bg-ink text-white"
                    : "bg-slate-50 text-slate-700"
                }`}
              >
                <div className={`text-xs uppercase tracking-[0.16em] ${item.role === "assistant" ? "text-slate-300" : "text-slate-500"}`}>
                  {item.role === "assistant" ? "AI lawyer" : "You"}
                </div>
                <div className="mt-2">{item.content}</div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 space-y-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder="Ask what argument is strongest, what proof is missing, or how to respond to the other side."
            className="w-full rounded-[24px] border border-slate-300 px-4 py-3 text-sm"
          />
          <button
            type="button"
            disabled={isSending || !message.trim()}
            onClick={() => void send()}
            className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send message"}
          </button>
        </div>
      </section>
    </div>
  );
}
