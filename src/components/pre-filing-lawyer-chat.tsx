"use client";

import { useMemo, useState } from "react";
import { getLawyerById } from "@/lib/lawyers";

type PreFilingLawyerChatProps = {
  lawyerKey: string;
  draftCaseData: unknown;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

export function PreFilingLawyerChat({ lawyerKey, draftCaseData }: PreFilingLawyerChatProps) {
  const lawyer = useMemo(() => getLawyerById(lawyerKey, "claimant"), [lawyerKey]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!lawyer) {
    return null;
  }

  async function send() {
    const message = input.trim();
    if (!message || !lawyer) {
      return;
    }

    try {
      setError(null);
      setSending(true);
      const nextMessages = [...messages, { role: "user", content: message } as Message];
      setMessages(nextMessages);
      setInput("");

      const response = await fetch("/api/lawyers/prefiling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lawyerName: lawyer.name,
          lawyerStyle: lawyer.style,
          partyRole: "claimant",
          draftCaseData,
          message,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to continue the conversation.");
      }
      setMessages([...nextMessages, { role: "assistant", content: result.data.reply }]);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Failed to continue the conversation.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">DIN.ORG Guide</div>
        <h2 className="mt-2 text-2xl font-semibold text-ink">{lawyer.name}</h2>
        <p className="mt-2 text-sm text-slate-600">
          Ask the Guide for help — sharpening the summary, naming the right party, framing claims,
          deciding what to do next.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {messages.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
            No messages yet. Ask what is missing, how to sharpen the claim, or what evidence to add.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-md px-4 py-3 text-sm leading-7 ${
                message.role === "assistant" ? "bg-ink text-white" : "bg-slate-50 text-slate-700"
              }`}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          rows={3}
          placeholder={`Ask ${lawyer.name} about your draft case...`}
          className="w-full rounded-md border border-slate-300 px-4 py-3 text-sm"
        />
        <button
          type="button"
          disabled={!input.trim() || sending}
          onClick={() => void send()}
          className="rounded-md bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
        >
          {sending ? "Sending..." : `Ask ${lawyer.name}`}
        </button>
      </div>
    </section>
  );
}
