"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { UIMessage } from "ai";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useChat } from "@ai-sdk/react";

import { ConfirmationCard } from "@/components/ui/ConfirmationCard";
import { TableModal } from "@/components/ui/TableModal";
import { TablePreview } from "@/components/ui/TablePreview";
import { ToolJsonView } from "@/components/ui/ToolJsonView";
import type { Thread } from "@/lib/client/api";
import type {
  ConfirmActionInput,
  ConfirmActionOutput,
  DeleteThreadOutput,
  ReadRangeOutput,
} from "@/lib/chat/tool-types";

type ChatPanelProps = {
  thread: Thread | null;
  initialMessages: UIMessage[];
  isLoading: boolean;
  error: string | null;
  onThreadsRefreshAction?: () => void;
  onOpenThreadsAction?: () => void;
};

type ChatPart = UIMessage["parts"][number];

type TextLikePart = Extract<ChatPart, { type: "text" | "reasoning" }>;

type ToolPart = Extract<ChatPart, { type: `tool-${string}` } | { type: "dynamic-tool" }>;

type ConfirmActionPart = ChatPart & {
  type: "tool-confirmAction";
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type ReadRangePart = ChatPart & {
  type: "tool-readRange";
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type DeleteThreadPart = ChatPart & {
  type: "tool-deleteThread";
  toolCallId: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type ConfirmStatus = "pending" | "approved" | "denied" | "error";

function isTextLikePart(part: ChatPart): part is TextLikePart {
  return part.type === "text" || part.type === "reasoning";
}

function isToolLikePart(part: ChatPart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isConfirmActionPart(part: ChatPart): part is ConfirmActionPart {
  return part.type === "tool-confirmAction";
}

function isReadRangePart(part: ChatPart): part is ReadRangePart {
  return part.type === "tool-readRange";
}

function isDeleteThreadPart(part: ChatPart): part is DeleteThreadPart {
  return part.type === "tool-deleteThread";
}

function isReadRangeOutput(output: unknown): output is ReadRangeOutput {
  if (!output || typeof output !== "object") {
    return false;
  }

  const record = output as Record<string, unknown>;
  if (record.sheet !== "Sheet1") {
    return false;
  }

  if (typeof record.range !== "string") {
    return false;
  }

  if (!Array.isArray(record.values)) {
    return false;
  }

  return (record.values as unknown[]).every(Array.isArray);
}

function isDeleteThreadOutput(output: unknown): output is DeleteThreadOutput {
  if (!output || typeof output !== "object") {
    return false;
  }

  const record = output as Record<string, unknown>;
  return typeof record.threadId === "string" && typeof record.deleted === "boolean";
}

function formatConfirmAction(action: ConfirmActionInput["action"]): string {
  switch (action) {
    case "updateCell":
      return "Update a spreadsheet cell";
    case "deleteThread":
      return "Delete this thread";
    case "sendInvites":
      return "Send email invites";
    default:
      return "Confirm action";
  }
}

function resolveConfirmStatus(part: ConfirmActionPart): ConfirmStatus {
  if (part.state === "output-error") {
    return "error";
  }
  if ("output" in part && part.output) {
    const output = part.output as ConfirmActionOutput;
    return output.approved ? "approved" : "denied";
  }
  if (part.state === "output-denied") {
    return "denied";
  }
  return "pending";
}

export function ChatPanel({
  thread,
  initialMessages,
  isLoading,
  error,
  onThreadsRefreshAction,
  onOpenThreadsAction,
}: ChatPanelProps) {
  const threadId = thread?.id ?? "no-thread";
  const [draftsByThreadId, setDraftsByThreadId] = useState<Record<string, string>>({});
  const [readRangeUiByThreadId, setReadRangeUiByThreadId] = useState<
    Record<
      string,
      { selectedToolCallId: string | null; modalOutput: ReadRangeOutput | null }
    >
  >({});

  const currentReadRangeUi = readRangeUiByThreadId[threadId];
  const selectedReadRangeToolCallId =
    currentReadRangeUi?.selectedToolCallId ?? null;
  const readRangeModalOutput = currentReadRangeUi?.modalOutput ?? null;

  const input = draftsByThreadId[threadId] ?? "";
  const setInput = useCallback(
    (value: string) => {
      setDraftsByThreadId((current) => ({ ...current, [threadId]: value }));
    },
    [threadId]
  );

  const insertMentionAction = useCallback(
    (mention: string) => {
      setDraftsByThreadId((current) => {
        const existing = current[threadId] ?? "";
        const separator = existing.length === 0 || /\s$/.test(existing) ? "" : " ";
        return { ...current, [threadId]: `${existing}${separator}${mention}` };
      });
    },
    [threadId]
  );

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);

  const {
    messages,
    setMessages,
    addToolOutput,
    sendMessage,
    status: chatStatus,
    error: chatError,
  } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  });

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages, setMessages]);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);

  const updateIsAtBottom = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return;
    }

    const threshold = 96;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distanceFromBottom < threshold;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!messageListRef.current) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  useEffect(() => {
    updateIsAtBottom();
  }, [updateIsAtBottom]);

  const previousChatStatusRef = useRef(chatStatus);

  useEffect(() => {
    const previousStatus = previousChatStatusRef.current;
    previousChatStatusRef.current = chatStatus;

    if (!thread?.id) {
      return;
    }

    const finished =
      (previousStatus === "submitted" || previousStatus === "streaming") &&
      chatStatus === "ready";

    if (finished) {
      onThreadsRefreshAction?.();
    }
  }, [chatStatus, onThreadsRefreshAction, thread?.id]);

  const confirmationTokensRef = useRef(new Map<string, string>());

  useEffect(() => {
    confirmationTokensRef.current.clear();
    isAtBottomRef.current = true;
    previousChatStatusRef.current = "ready";

    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
      updateIsAtBottom();
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [scrollToBottom, threadId, updateIsAtBottom]);

  const getConfirmationToken = useCallback((toolCallId: string) => {
    const existing = confirmationTokensRef.current.get(toolCallId);
    if (existing) {
      return existing;
    }
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    confirmationTokensRef.current.set(toolCallId, token);
    return token;
  }, []);

  const handleConfirmAction = useCallback(
    async (part: ConfirmActionPart, approved: boolean) => {
      const input = part.input as ConfirmActionInput | undefined;
      if (!input || !part.toolCallId) {
        return;
      }
      const output = {
        approved,
        confirmationToken: getConfirmationToken(part.toolCallId),
        action: input.action,
        actionPayload: input.actionPayload,
        ...(approved ? {} : { reason: "User declined" }),
      } as ConfirmActionOutput;

      await addToolOutput({
        tool: "confirmAction",
        toolCallId: part.toolCallId,
        output,
      });
    },
    [addToolOutput, getConfirmationToken]
  );

  const title = thread?.title?.trim()
    ? thread.title
    : thread
      ? "Untitled thread"
      : "No thread selected";

  const loadingMessage = isLoading ? "Loading messages..." : null;
  const isChatBusy = chatStatus === "submitted" || chatStatus === "streaming";
  const chatStatusLabel =
    chatStatus === "submitted"
      ? "Sending"
      : chatStatus === "streaming"
        ? "Streaming"
        : "Ready";
  const status = error || chatError ? "Error" : loadingMessage ? "Loading" : chatStatusLabel;

  useEffect(() => {
    if (!isAtBottomRef.current) {
      return;
    }

    const behavior: ScrollBehavior = isChatBusy ? "auto" : "smooth";
    const raf = requestAnimationFrame(() => {
      scrollToBottom(behavior);
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isChatBusy, messages, scrollToBottom]);

  const visibleMessageCount = useMemo(() => {
    if (!thread) {
      return 0;
    }

    if (!isChatBusy) {
      return messages.length;
    }

    if (messages.length === 0) {
      return 0;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === "assistant") {
      return Math.max(0, messages.length - 1);
    }

    return messages.length;
  }, [isChatBusy, messages, thread]);

  const messageCountLabel = visibleMessageCount === 1 ? "message" : "messages";

  const subtitle = error
    ? error
    : chatError
      ? chatError.message
      : loadingMessage
        ? loadingMessage
        : thread
          ? `${visibleMessageCount} ${messageCountLabel}`
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

  const canSend =
    Boolean(thread) && input.trim().length > 0 && !isLoading && !isChatBusy;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    const nextInput = input.trim();
    isAtBottomRef.current = true;
    setInput("");
    await sendMessage({ text: nextInput });
  };

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-6 p-6 motion-safe:animate-[rise_0.7s_ease-out_0.1s_both]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            Active thread
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {onOpenThreadsAction ? (
            <button
              type="button"
              onClick={onOpenThreadsAction}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
            >
              Threads
            </button>
          ) : null}
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            {status}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-surface p-6 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.35)]">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-base font-medium text-foreground">
                {mainMessage}
              </p>
              <p className="text-sm text-muted">{hint}</p>
            </div>
          ) : (
            <div
              ref={messageListRef}
              role="log"
              aria-label="Chat messages"
              onScroll={updateIsAtBottom}
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`w-fit max-w-[92%] rounded-2xl border p-4 shadow-sm lg:max-w-[75%] ${
                    message.role === "user"
                      ? "ml-auto border-accent bg-accent-soft text-accent-ink"
                      : "border-border bg-surface text-foreground"
                  }`}
                >
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                    {message.role}
                  </div>
                  <div className="space-y-3 text-sm leading-relaxed">
                    {message.parts.map((part, index) => {
                      if (isTextLikePart(part)) {
                        return (
                          <p
                            key={`${message.id}-part-${index}`}
                            className="whitespace-pre-wrap break-words"
                          >
                            {part.text}
                          </p>
                        );
                      }
                      if (isConfirmActionPart(part)) {
                        const input = part.input as ConfirmActionInput | undefined;
                        const output =
                          "output" in part
                            ? (part.output as ConfirmActionOutput | undefined)
                            : undefined;
                        const action = input?.action ?? output?.action;
                        const payload = input?.actionPayload ?? output?.actionPayload;
                        const status = resolveConfirmStatus(part);
                        const title = action ? formatConfirmAction(action) : "Confirm action";
                        const description =
                          status === "error"
                            ? part.errorText ?? "Failed to prepare confirmation."
                            : input?.prompt ??
                                (status === "pending"
                                  ? "Review and confirm to proceed."
                                  : "Confirmation recorded.");
                        const isActionable =
                          status === "pending" && part.state === "input-available" && input;

                        return (
                          <div key={`${message.id}-part-${index}`}>
                            <ConfirmationCard
                              title={title}
                              description={description}
                              payload={payload}
                              status={status}
                              onApprove={
                                isActionable
                                  ? () => handleConfirmAction(part, true)
                                  : undefined
                              }
                              onReject={
                                isActionable
                                  ? () => handleConfirmAction(part, false)
                                  : undefined
                              }
                              disabled={!isActionable}
                            />
                          </div>
                        );
                      }
                      if (isReadRangePart(part)) {
                        const output =
                          "output" in part ? (part.output as unknown) : undefined;

                        if (part.state === "output-error") {
                          const errorText =
                            part.errorText ?? "Failed to read spreadsheet range.";
                          return (
                            <div
                              key={`${message.id}-part-${index}`}
                              className="rounded-2xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                            >
                              <div className="font-semibold uppercase tracking-[0.2em] text-red-700 dark:text-red-200">
                                Range read failed
                              </div>
                              <div className="mt-2">{errorText}</div>
                              {output != null ? (
                                <div className="mt-3">
                                  <ToolJsonView payload={output} />
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        if (output != null) {
                          const parsed = isReadRangeOutput(output)
                            ? (output as ReadRangeOutput)
                            : null;
                          const rangeLabel = parsed
                            ? `${parsed.sheet}!${parsed.range}`
                            : "Sheet1 (unknown range)";

                          return (
                            <div key={`${message.id}-part-${index}`} className="space-y-3">
                              {parsed ? (
                                <>
                                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                                    Range{" "}
                                    <span className="font-mono text-foreground">
                                      {rangeLabel}
                                    </span>
                                  </div>
                                  <TablePreview
                                    values={parsed.values}
                                    selected={
                                      selectedReadRangeToolCallId === part.toolCallId
                                    }
                                    onClick={() => {
                                      setReadRangeUiByThreadId((current) => ({
                                        ...current,
                                        [threadId]: {
                                          selectedToolCallId: part.toolCallId,
                                          modalOutput: parsed,
                                        },
                                      }));
                                    }}
                                    ariaLabel={`Preview ${rangeLabel}`}
                                  />
                                </>
                              ) : (
                                <div className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted">
                                  Tool returned an unexpected payload.
                                </div>
                              )}
                              <ToolJsonView payload={output} />
                            </div>
                          );
                        }

                        const toolState = part.state ?? "unknown";

                        return (
                          <div
                            key={`${message.id}-part-${index}`}
                            className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              Tool: readRange
                            </div>
                            <div className="mt-2">Status: {toolState}</div>
                          </div>
                        );
                      }
                      if (isDeleteThreadPart(part)) {
                        const output =
                          "output" in part ? (part.output as unknown) : undefined;

                        if (part.state === "output-error") {
                          const errorText =
                            part.errorText ?? "Failed to delete thread.";
                          return (
                            <div
                              key={`${message.id}-part-${index}`}
                              className="rounded-2xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                            >
                              <div className="font-semibold uppercase tracking-[0.2em] text-red-700 dark:text-red-200">
                                Thread delete failed
                              </div>
                              <div className="mt-2">{errorText}</div>
                              {output != null ? (
                                <div className="mt-3">
                                  <ToolJsonView payload={output} />
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        if (output != null) {
                          const parsed = isDeleteThreadOutput(output)
                            ? (output as DeleteThreadOutput)
                            : null;
                          const deleted = parsed?.deleted ?? false;

                          return (
                            <div key={`${message.id}-part-${index}`} className="space-y-3">
                              <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted">
                                <div className="font-semibold uppercase tracking-[0.2em]">
                                  Thread deletion
                                </div>
                                {parsed ? (
                                  <div className="mt-2 space-y-1">
                                    <div>
                                      Thread:{" "}
                                      <span className="font-mono text-foreground">
                                        {parsed.threadId}
                                      </span>
                                    </div>
                                    <div>
                                      Result:{" "}
                                      <span
                                        className={
                                          deleted
                                            ? "font-semibold text-foreground"
                                            : "font-semibold text-muted"
                                        }
                                      >
                                        {deleted ? "Deleted" : "Not found"}
                                      </span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mt-2">
                                    Tool returned an unexpected payload.
                                  </div>
                                )}

                                {deleted && onThreadsRefreshAction ? (
                                  <div className="mt-3">
                                    <button
                                      type="button"
                                      onClick={onThreadsRefreshAction}
                                      className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    >
                                      Refresh threads
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                              <ToolJsonView payload={output} />
                            </div>
                          );
                        }

                        const toolState = part.state ?? "unknown";

                        return (
                          <div
                            key={`${message.id}-part-${index}`}
                            className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              Tool: deleteThread
                            </div>
                            <div className="mt-2">Status: {toolState}</div>
                          </div>
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
                            className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              Tool: {toolName}
                            </div>
                            <div className="mt-2">Status: {toolState}</div>
                          </div>
                        );
                      }
                      if (part.type === "step-start") {
                        return null;
                      }
                      return (
                        <div
                          key={`${message.id}-part-${index}`}
                          className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                        >
                          Unsupported part: {part.type}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {!thread ? (
          <div className="shrink-0 rounded-3xl border border-dashed border-border bg-surface-muted p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
                  No thread selected
                </p>
                <p className="mt-2 text-sm text-muted">
                  Select or create a thread to start chatting.
                  <span className="hidden lg:inline"> Choose one from the sidebar.</span>
                </p>
              </div>
              {onOpenThreadsAction ? (
                <button
                  type="button"
                  onClick={onOpenThreadsAction}
                  className="rounded-full bg-accent-soft px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-ink shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
                >
                  Threads
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="shrink-0 rounded-3xl border border-border bg-surface p-4 shadow-sm focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 focus-within:ring-offset-background"
          >
            <div className="flex flex-col gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type a message to get started..."
                className="min-h-24 max-h-40 w-full resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted focus-visible:outline-none disabled:opacity-60"
                disabled={false}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted">
                  Mentions: <span className="font-mono">@Sheet1!A1:C5</span>
                </span>
                <button
                  type="submit"
                  disabled={!canSend}
                  className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {readRangeModalOutput ? (
        <TableModal
          key={`${readRangeModalOutput.sheet}!${readRangeModalOutput.range}`}
          open={true}
          data={readRangeModalOutput}
          onCloseAction={() =>
            setReadRangeUiByThreadId((current) => {
              const existing = current[threadId];
              return {
                ...current,
                [threadId]: {
                  selectedToolCallId: existing?.selectedToolCallId ?? null,
                  modalOutput: null,
                },
              };
            })
          }
          onInsertMentionAction={insertMentionAction}
        />
      ) : null}
    </section>
  );
}
