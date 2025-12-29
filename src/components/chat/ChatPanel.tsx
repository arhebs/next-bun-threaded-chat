"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { UIMessage } from "ai";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Chat, useChat } from "@ai-sdk/react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { ConfirmationCard } from "@/components/ui/ConfirmationCard";
import { TableModal } from "@/components/ui/TableModal";
import { TablePreview, formatCellValue } from "@/components/ui/TablePreview";
import { ToolJsonView } from "@/components/ui/ToolJsonView";
import type { Thread } from "@/lib/client/api";
import type {
  ConfirmActionInput,
  ConfirmActionOutput,
  DeleteThreadOutput,
  ReadRangeOutput,
  UpdateCellOutput,
} from "@/lib/chat/tool-types";

type ChatPanelProps = {
  thread: Thread | null;
  initialMessages: UIMessage[];
  isLoading: boolean;
  error: string | null;
  onThreadsRefreshAction?: () => void;
  onThreadTouchAction?: (threadId: string, options?: { titleCandidate?: string }) => void;
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

type UpdateCellPart = ChatPart & {
  type: "tool-updateCell";
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

function sanitizeMarkdownHref(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }

  const trimmed = href.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return trimmed;
  }

  if (/^(mailto:|tel:)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return undefined;
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ href, children }) => {
    const safeHref = sanitizeMarkdownHref(href);
    const isExternal = typeof safeHref === "string" && /^https?:\/\//i.test(safeHref);

    if (!safeHref) {
      return <span className="font-medium text-foreground">{children}</span>;
    }

    return (
      <a
        href={safeHref}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer noopener" : undefined}
        className="font-medium text-accent underline underline-offset-4 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="not-prose my-4 overflow-x-auto rounded-2xl border border-border bg-surface-muted">
      <table
        aria-label="Markdown table"
        className="min-w-full border-collapse text-left text-xs"
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="[&>tr:last-child]:border-b-0">{children}</tbody>
  ),
  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
  th: ({ children }) => (
    <th className="border-r border-border px-3 py-2 text-xs font-semibold text-foreground last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-r border-border px-3 py-2 align-top text-sm text-muted last:border-r-0">
      {children}
    </td>
  ),
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;

    if (!child || typeof child !== "object" || !("props" in child)) {
      return (
        <pre className="overflow-x-auto whitespace-pre font-mono text-xs text-foreground">
          {children}
        </pre>
      );
    }

    const codeElement = child as { props?: { className?: unknown; children?: unknown } };
    const className =
      typeof codeElement.props?.className === "string" ? codeElement.props.className : "";
    const raw = codeElement.props?.children;
    const content = Array.isArray(raw)
      ? raw.join("")
      : typeof raw === "string"
        ? raw
        : String(raw ?? "");
    const normalized = content.replace(/\n$/, "");
    const match = /language-(\w+)/.exec(className);
    const language = match?.[1];

    return (
      <div className="not-prose my-4 rounded-2xl border border-border bg-surface-muted p-3">
        {language ? (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            {language}
          </div>
        ) : null}
        <pre className="overflow-x-auto whitespace-pre font-mono text-xs text-foreground">
          <code>{normalized}</code>
        </pre>
      </div>
    );
  },
  code: ({ node: _node, className, children, ...props }) => {
    const raw = Array.isArray(children) ? children.join("") : String(children ?? "");
    const content = raw.replace(/\n$/, "");

    const preserveClassName =
      typeof className === "string" && (/language-/.test(className) || content.includes("\n"));

    if (preserveClassName) {
      return (
        <code {...props} className={`not-prose ${className}`}>
          {content}
        </code>
      );
    }

    return (
      <code
        {...props}
        className="not-prose rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground"
      >
        {content}
      </code>
    );
  },
};

function renderMarkdownBlocks(text: string, _keyPrefix: string): ReactNode {
  return (
    <div className="space-y-3 prose prose-sm prose-neutral dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

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

function isUpdateCellPart(part: ChatPart): part is UpdateCellPart {
  return part.type === "tool-updateCell";
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

function isUpdateCellOutput(output: unknown): output is UpdateCellOutput {
  if (!output || typeof output !== "object") {
    return false;
  }

  const record = output as Record<string, unknown>;
  if (record.sheet !== "Sheet1") {
    return false;
  }

  if (typeof record.cell !== "string") {
    return false;
  }

  const value = record.value;
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
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
  onThreadTouchAction,
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

  const chatsByThreadIdRef = useRef(new Map<string, Chat<UIMessage>>());

  const chat = useMemo(() => {
    const existing = chatsByThreadIdRef.current.get(threadId);
    if (existing) {
      return existing;
    }

    const created = new Chat<UIMessage>({
      id: threadId,
      messages: [],
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    });

    chatsByThreadIdRef.current.set(threadId, created);
    return created;
  }, [threadId, transport]);

  const {
    messages,
    setMessages,
    addToolOutput,
    sendMessage,
    clearError,
    status: chatStatus,
    error: chatError,
  } = useChat({ chat });

  const [isCrossfading, setIsCrossfading] = useState(false);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    const shouldAnimate = hasMountedRef.current;
    hasMountedRef.current = true;

    if (!shouldAnimate) {
      return;
    }

    setIsCrossfading(true);
    const timeout = setTimeout(() => {
      setIsCrossfading(false);
    }, 250);

    return () => {
      clearTimeout(timeout);
    };
  }, [threadId]);

  useLayoutEffect(() => {
    if (initialMessages.length === 0) {
      return;
    }

    if (chat.messages.length > 0) {
      return;
    }

    setMessages(initialMessages);
  }, [chat, initialMessages, setMessages]);

  const [showHistoryLoadingIndicator, setShowHistoryLoadingIndicator] = useState(false);
  const historyLoadingShownAtRef = useRef<number | null>(null);

  useEffect(() => {
    setShowHistoryLoadingIndicator(false);
    historyLoadingShownAtRef.current = null;
  }, [threadId]);

  useEffect(() => {
    const delayMs = 150;
    const minVisibleMs = 250;

    if (isLoading) {
      const timeout = setTimeout(() => {
        historyLoadingShownAtRef.current = Date.now();
        setShowHistoryLoadingIndicator(true);
      }, delayMs);

      return () => clearTimeout(timeout);
    }

    if (!showHistoryLoadingIndicator) {
      return;
    }

    const shownAt = historyLoadingShownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const remaining = minVisibleMs - elapsed;

    if (remaining <= 0) {
      setShowHistoryLoadingIndicator(false);
      historyLoadingShownAtRef.current = null;
      return;
    }

    const timeout = setTimeout(() => {
      setShowHistoryLoadingIndicator(false);
      historyLoadingShownAtRef.current = null;
    }, remaining);

    return () => clearTimeout(timeout);
  }, [isLoading, showHistoryLoadingIndicator]);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const isAtBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const isAutoScrollingRef = useRef(false);
  const scrollIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const computeIsNearBottom = useCallback(() => {
    const container = messageListRef.current;
    if (!container) {
      return true;
    }

    const threshold = 96;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < threshold;
  }, []);

  const updateIsAtBottom = useCallback(() => {
    isAtBottomRef.current = computeIsNearBottom();
  }, [computeIsNearBottom]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    if (!messageListRef.current) {
      return;
    }

    isAutoScrollingRef.current = true;
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }

    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });

    const resetDelay = behavior === "smooth" ? 300 : 120;
    autoScrollTimeoutRef.current = setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, resetDelay);
  }, []);

  const handleMessageScroll = useCallback(() => {
    updateIsAtBottom();

    if (isAutoScrollingRef.current) {
      return;
    }

    isUserScrollingRef.current = true;

    if (scrollIdleTimeoutRef.current) {
      clearTimeout(scrollIdleTimeoutRef.current);
    }

    scrollIdleTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 160);
  }, [updateIsAtBottom]);

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
    isUserScrollingRef.current = false;
    isAutoScrollingRef.current = false;
    previousChatStatusRef.current = "ready";

    if (scrollIdleTimeoutRef.current) {
      clearTimeout(scrollIdleTimeoutRef.current);
    }

    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
    }

    const raf = requestAnimationFrame(() => {
      scrollToBottom("auto");
      updateIsAtBottom();
      inputRef.current?.focus();
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

  const loadingMessage = showHistoryLoadingIndicator ? "Loading messages..." : null;
  const isChatBusy = chatStatus === "submitted" || chatStatus === "streaming";
  const chatStatusLabel =
    chatStatus === "submitted"
      ? "Sending"
      : chatStatus === "streaming"
        ? "Streaming"
        : "Ready";

  const renderedMessages = useMemo(
    () => messages.filter((message) => message.parts.length > 0),
    [messages]
  );

  const status = isChatBusy
    ? chatStatusLabel
    : loadingMessage
      ? "Loading"
      : error || chatError
        ? "Error"
        : chatStatusLabel;

  useEffect(() => {
    if (!isAtBottomRef.current || isUserScrollingRef.current) {
      return;
    }

    const behavior: ScrollBehavior = isChatBusy ? "auto" : "smooth";
    const raf = requestAnimationFrame(() => {
      scrollToBottom(behavior);
    });

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [isChatBusy, renderedMessages, scrollToBottom]);

  useEffect(() => {
    if (chatStatus !== "streaming" || isUserScrollingRef.current) {
      return;
    }

    isAtBottomRef.current = true;
    scrollToBottom("auto");
  }, [chatStatus, scrollToBottom]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!isAtBottomRef.current || isUserScrollingRef.current) {
        return;
      }

      scrollToBottom("auto");
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [scrollToBottom]);

  const visibleMessageCount = useMemo(() => {
    if (!thread) {
      return 0;
    }

    if (!isChatBusy) {
      return renderedMessages.length;
    }

    if (renderedMessages.length === 0) {
      return 0;
    }

    const lastMessage = renderedMessages[renderedMessages.length - 1];
    if (lastMessage?.role === "assistant") {
      return Math.max(0, renderedMessages.length - 1);
    }

    return renderedMessages.length;
  }, [isChatBusy, renderedMessages, thread]);

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

  const shouldShowHistoryOverlay =
    Boolean(thread) && Boolean(loadingMessage) && renderedMessages.length > 0;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    const nextInput = input.trim();
    isAtBottomRef.current = true;
    setInput("");
    clearError();
    onThreadTouchAction?.(threadId, { titleCandidate: nextInput });
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
          <div className="relative flex min-h-0 flex-1 flex-col rounded-3xl border border-border bg-surface p-6 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.35)]">
            {renderedMessages.length === 0 ? (
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
                onScroll={handleMessageScroll}
                className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2 transition-opacity duration-[250ms] ease-in-out motion-safe:will-change-[opacity] ${
                  isCrossfading ? "opacity-95" : "opacity-100"
                }`}
                aria-busy={shouldShowHistoryOverlay || undefined}
              >
                {renderedMessages.map((message) => (
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
                            <div
                              key={`${message.id}-part-${index}`}
                              className="space-y-3"
                            >
                              {renderMarkdownBlocks(part.text, `${message.id}-part-${index}`)}
                            </div>
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
                        const inputRecord =
                          part.input && typeof part.input === "object"
                            ? (part.input as Record<string, unknown>)
                            : null;
                        const rangeLabel =
                          typeof inputRecord?.sheet === "string" &&
                          typeof inputRecord?.range === "string"
                            ? `${inputRecord.sheet}!${inputRecord.range}`
                            : null;
                        const heading = toolState.startsWith("input")
                          ? "Reading spreadsheet..."
                          : "Tool: readRange";

                        return (
                          <div
                            key={`${message.id}-part-${index}`}
                            className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              {heading}
                            </div>
                            {rangeLabel ? (
                              <div className="mt-2 font-mono text-foreground">
                                {rangeLabel}
                              </div>
                            ) : null}
                            <div className="mt-2">Status: {toolState}</div>
                          </div>
                        );
                      }
                      if (isUpdateCellPart(part)) {
                        const inputRecord =
                          part.input && typeof part.input === "object"
                            ? (part.input as Record<string, unknown>)
                            : null;
                        const sheetLabel =
                          typeof inputRecord?.sheet === "string" ? inputRecord.sheet : "Sheet1";
                        const cellLabel =
                          typeof inputRecord?.cell === "string" ? inputRecord.cell : null;
                        const output =
                          "output" in part ? (part.output as unknown) : undefined;

                        if (part.state === "output-error") {
                          const errorText =
                            part.errorText ?? "Failed to update spreadsheet.";
                          return (
                            <div
                              key={`${message.id}-part-${index}`}
                              className="rounded-2xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                            >
                              <div className="font-semibold uppercase tracking-[0.2em] text-red-700 dark:text-red-200">
                                Spreadsheet update failed
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
                          const parsed = isUpdateCellOutput(output)
                            ? (output as UpdateCellOutput)
                            : null;
                          const target = parsed
                            ? `${parsed.sheet}!${parsed.cell}`
                            : cellLabel
                              ? `${sheetLabel}!${cellLabel}`
                              : "Sheet1 (unknown cell)";

                          return (
                            <div key={`${message.id}-part-${index}`} className="space-y-3">
                              <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted">
                                <div className="font-semibold uppercase tracking-[0.2em]">
                                  Spreadsheet update
                                </div>
                                <div className="mt-2">
                                  Target:{" "}
                                  <span className="font-mono text-foreground">
                                    {target}
                                  </span>
                                </div>
                                {parsed ? (
                                  <div className="mt-1">
                                    Value:{" "}
                                    <span className="font-mono text-foreground">
                                      {formatCellValue(parsed.value)}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                              <ToolJsonView payload={output} />
                            </div>
                          );
                        }

                        const toolState = part.state ?? "unknown";
                        const target = cellLabel ? `${sheetLabel}!${cellLabel}` : null;

                        return (
                          <div
                            key={`${message.id}-part-${index}`}
                            className="rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted"
                          >
                            <div className="font-semibold uppercase tracking-[0.2em]">
                              Updating spreadsheet...
                            </div>
                            {target ? (
                              <div className="mt-2 font-mono text-foreground">
                                {target}
                              </div>
                            ) : null}
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

          {shouldShowHistoryOverlay ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-3xl bg-background/35 backdrop-blur-[1px]">
              <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted shadow-sm">
                Loading messages...
              </div>
            </div>
          ) : null}
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
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.ctrlKey) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
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
