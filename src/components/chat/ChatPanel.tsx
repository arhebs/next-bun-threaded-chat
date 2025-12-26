"use client";

import { useMemo, useState } from "react";
import type { UIMessage } from "ai";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useChat } from "@ai-sdk/react";

import type { Thread } from "@/lib/client/api";

type ChatPanelProps = {
  thread: Thread | null;
  initialMessages: UIMessage[];
  isLoading: boolean;
  error: string | null;
};

type ChatPart = UIMessage["parts"][number];

type TextLikePart = Extract<ChatPart, { type: "text" | "reasoning" }>;

type ToolPart = Extract<ChatPart, { type: `tool-${string}` } | { type: "dynamic-tool" }>;

function isTextLikePart(part: ChatPart): part is TextLikePart {
  return part.type === "text" || part.type === "reasoning";
}

function isToolLikePart(part: ChatPart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

export function ChatPanel({
  thread,
  initialMessages,
  isLoading,
  error,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const {
    messages,
    sendMessage,
    status: chatStatus,
    error: chatError,
  } = useChat({
    id: thread?.id ?? "no-thread",
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  const title = thread?.title?.trim()
    ? thread.title
    : thread
      ? "Untitled thread"
      : "No thread selected";

  const loadingMessage = isLoading ? "Loading messages..." : null;
  const chatStatusLabel = chatStatus === "streaming" ? "Streaming" : "Ready";
  const status = error || chatError ? "Error" : loadingMessage ? "Loading" : chatStatusLabel;

  const subtitle = error
    ? error
    : chatError
      ? chatError.message
      : loadingMessage
        ? loadingMessage
        : thread
          ? `${messages.length} messages loaded`
          : "Create or select a thread to begin.";

  const mainMessage = error
    ? "We couldn't load messages for this thread."
    : chatError
      ? "Something went wrong while chatting."
      : loadingMessage
        ? "Fetching saved messages..."
        : thread
          ? "Your chat will appear here."
          : "Select a thread to start chatting.";

  const hint = thread
    ? "Ask about Sheet1 or paste a mention to preview a range."
    : "Start by creating a new thread in the sidebar.";

  const canSend = Boolean(thread) && input.trim().length > 0 && !isLoading;

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    const nextInput = input.trim();
    setInput("");
    await sendMessage({ text: nextInput });
  };

  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-1 flex-col gap-6 p-6 lg:h-screen motion-safe:animate-[rise_0.7s_ease-out_0.1s_both]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
            Active thread
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            {title}
          </h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">{subtitle}</p>
        </div>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          {status}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex-1 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.35)]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-base font-medium text-[color:var(--foreground)]">
                {mainMessage}
              </p>
              <p className="text-sm text-[color:var(--muted)]">{hint}</p>
            </div>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`rounded-2xl border p-4 ${
                    message.role === "user"
                      ? "ml-auto border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                      : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)]"
                  }`}
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                    {message.role}
                  </div>
                  <div className="space-y-3 text-sm">
                    {message.parts.map((part, index) => {
                      if (isTextLikePart(part)) {
                        return (
                          <p key={`${message.id}-part-${index}`}>
                            {part.text}
                          </p>
                        );
                      }
                      if (isToolLikePart(part)) {
                        const toolName =
                          part.type === "dynamic-tool"
                            ? part.toolName
                            : part.type.replace("tool-", "");
                        const toolState = "state" in part ? part.state : "unknown";
                        return (
                          <div
                            key={`${message.id}-part-${index}`}
                            className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-[color:var(--muted)]"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              Tool: {toolName}
                            </div>
                            <div className="mt-2">Status: {toolState}</div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`${message.id}-part-${index}`}
                          className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-[color:var(--muted)]"
                        >
                          Unsupported part: {part.type}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4"
        >
          <div className="flex flex-col gap-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Type a message to get started..."
              className="min-h-[96px] resize-none bg-transparent text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:outline-none"
              disabled={!thread || isLoading}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[color:var(--muted)]">
                Mentions: <span className="font-mono">@Sheet1!A1:C5</span>
              </span>
              <button
                type="submit"
                disabled={!canSend}
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-60"
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
