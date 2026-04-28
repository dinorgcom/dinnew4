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
  lawyerName?: string | null;
  initialConversation: {
    lawyerPersonality?: string | null;
    contextSummary?: string | null;
    messagesJson?: Record<string, unknown>[] | null;
  } | null;
  compact?: boolean;
};

export function LawyerChatPanel({ caseId, canUseChat, lawyerName, initialConversation, compact = false }: LawyerChatPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [personality, setPersonality] = useState(initialConversation?.lawyerPersonality || "strategic");
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState(initialConversation);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  
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
    if (!message.trim()) return;
    
    try {
      setError(null);
      setIsSending(true);
      
      // Show user's message immediately
      const userMessage: LawyerMessage = {
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      
      // Add pending message to display immediately
      setPendingMessage(message);
      setMessage("");
      
      // Show typing indicator
      setIsTyping(true);
      
      const response = await fetch(`/api/cases/${caseId}/lawyer-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.content, personality }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to continue chat.");
      }
      
      // Update conversation with server response
      setConversation(result.data);
      setPendingMessage(null);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to continue chat.");
      setPendingMessage(null);
    } finally {
      setIsSending(false);
      setIsTyping(false);
    }
  }

  if (!canUseChat) {
    return (
      <section className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Lawyer chat is only available to the claimant or respondent on this case.
      </section>
    );
  }

  if (compact) {
    return (
      <section className="flex h-full flex-col overflow-hidden bg-ink text-white shadow-[0_24px_60px_rgba(17,24,39,0.24)]">
        <div className="border-b border-white/10 px-5 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
            {lawyerName || "Lawyer chat"}
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !pendingMessage ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
              Ask about strategy, evidence gaps, or what to do next.
            </div>
          ) : (
            <>
              {messages.map((item, index) => (
                <div
                  key={`${item.createdAt}-${index}`}
                  className={`rounded-2xl px-3 py-2.5 text-sm leading-6 ${
                    item.role === "assistant"
                      ? "bg-white/10 text-white"
                      : "bg-white text-ink"
                  }`}
                >
                  <div className={`text-[10px] uppercase tracking-[0.16em] ${
                    item.role === "assistant" ? "text-slate-300" : "text-slate-500"
                  }`}>
                    {item.role === "assistant" ? lawyerName || "AI lawyer" : "You"}
                  </div>
                  <div className="mt-1.5">{item.content}</div>
                </div>
              ))}
              {pendingMessage ? (
                <div className="rounded-2xl bg-white px-3 py-2.5 text-sm leading-6 text-ink">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">You</div>
                  <div className="mt-1.5">{pendingMessage}</div>
                </div>
              ) : null}
              {isTyping ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-white/10 px-3 py-2.5">
                    <div className="flex items-center space-x-1">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
        {error ? (
          <div className="border-t border-rose-400/30 bg-rose-500/20 px-4 py-2 text-xs text-rose-100">{error}</div>
        ) : null}
        <div className="border-t border-white/10 p-3">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && message.trim()) {
                event.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Ask your lawyer..."
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 focus:border-white/30 focus:outline-none"
          />
          <button
            type="button"
            disabled={isSending || !message.trim()}
            onClick={() => void send()}
            className="mt-2 w-full rounded-full bg-white px-4 py-2 text-xs font-semibold text-ink transition hover:bg-slate-100 disabled:opacity-50"
          >
            {isSending ? "Sending..." : "Send"}
          </button>
        </div>
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
          {messages.length === 0 && !pendingMessage ? (
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              No messages yet. Ask about strategy, evidence gaps, negotiation framing, or what to do next.
            </div>
          ) : (
            <>
              {messages.map((item, index) => (
                <div
                  key={`${item.createdAt}-${index}`}
                  className={`rounded-2xl px-4 py-3 text-sm leading-7 ${
                    item.role === "assistant"
                      ? "bg-ink text-white"
                      : "bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className={`text-xs uppercase tracking-[0.16em] ${item.role === "assistant" ? "text-slate-300" : "text-slate-500"}`}>
                    {item.role === "assistant" ? lawyerName || "AI lawyer" : "You"}
                  </div>
                  <div className="mt-2">{item.content}</div>
                </div>
              ))}

              {/* Pending user message */}
              {pendingMessage && (
                <div className="rounded-2xl px-4 py-3 text-sm leading-7 bg-slate-50 text-slate-700">
                  <div className="text-xs uppercase tracking-[0.16em] text-slate-500">You</div>
                  <div className="mt-2">{pendingMessage}</div>
                </div>
              )}

              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-2xl px-4 py-3 bg-ink text-white shadow-sm">
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </>
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
