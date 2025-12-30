"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { fetchThreadMessages, listThreads, type Thread } from "@/lib/client/api";

function deriveThreadTitleFromText(text: string): string | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const maxLength = 30;
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function deriveThreadTitleFromMessages(messages: UIMessage[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const part of message.parts) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const record = part as { type?: unknown; text?: unknown };
      if (record.type !== "text" || typeof record.text !== "string") {
        continue;
      }

      const derived = deriveThreadTitleFromText(record.text);
      if (derived) {
        return derived;
      }
    }
  }

  return null;
}

function mergeThreadsPreservingLocalState(current: Thread[], incoming: Thread[]): Thread[] {
  const byId = new Map<string, Thread>();
  for (const thread of current) {
    byId.set(thread.id, thread);
  }

  const merged = incoming.map((thread) => {
    const existing = byId.get(thread.id);
    if (!existing) {
      return thread;
    }

    return {
      ...thread,
      title: thread.title || existing.title,
      createdAt: Math.min(thread.createdAt, existing.createdAt),
      updatedAt: Math.max(thread.updatedAt, existing.updatedAt),
    };
  });

  merged.sort((left, right) => {
    const diff = right.updatedAt - left.updatedAt;
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });

  return merged;
}

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const explicitSelectionRef = useRef<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [messagesByThreadId, setMessagesByThreadId] = useState<Record<string, UIMessage[]>>(
    {}
  );
  const messagesByThreadIdRef = useRef(messagesByThreadId);

  useEffect(() => {
    messagesByThreadIdRef.current = messagesByThreadId;
  }, [messagesByThreadId]);

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleThreadsChange = useCallback((nextThreads: Thread[]) => {
    setThreads((current) => mergeThreadsPreservingLocalState(current, nextThreads));

    setMessagesByThreadId((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }

      const allowed = new Set(nextThreads.map((thread) => thread.id));
      let changed = false;
      const next: Record<string, UIMessage[]> = {};

      for (const [threadId, messages] of Object.entries(current)) {
        if (allowed.has(threadId)) {
          next[threadId] = messages;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });

    setSelectedThreadId((current) => {
      if (nextThreads.length === 0) {
        explicitSelectionRef.current = null;
        setInitialMessages([]);
        setMessageError(null);
        setIsLoadingMessages(false);
        return null;
      }

      const explicitSelection = explicitSelectionRef.current;
      const hasExplicitSelection = Boolean(
        explicitSelection && nextThreads.some((thread) => thread.id === explicitSelection)
      );

      const currentIsValid = Boolean(
        current && nextThreads.some((thread) => thread.id === current)
      );

      const nextId = hasExplicitSelection
        ? (explicitSelection as string)
        : currentIsValid
          ? current
          : nextThreads[0]?.id ?? null;

      if (nextId && nextId !== current) {
        const cached = messagesByThreadIdRef.current[nextId];
        setInitialMessages(cached ?? []);
        setMessageError(null);
        setIsLoadingMessages(true);
      }

      if (explicitSelection && !hasExplicitSelection) {
        explicitSelectionRef.current = null;
      }

      return nextId;
    });
  }, []);

  const handleSelectThread = useCallback(
    (threadId: string, options?: { skipMessageLoad?: boolean }) => {
      setIsSidebarOpen(false);

      if (threadId === selectedThreadId) {
        return;
      }

      explicitSelectionRef.current = threadId;
      setSelectedThreadId(threadId);
      const cached = messagesByThreadIdRef.current[threadId];
      setInitialMessages(cached ?? []);
      setMessageError(null);

      if (cached && cached.length > 0) {
        const derivedTitle = deriveThreadTitleFromMessages(cached);
        if (derivedTitle) {
          setThreads((current) =>
            current.map((thread) => {
              if (thread.id !== threadId || thread.title) {
                return thread;
              }
              return { ...thread, title: derivedTitle };
            })
          );
        }
      }

      if (options?.skipMessageLoad) {
        setIsLoadingMessages(false);
        return;
      }

      setIsLoadingMessages(true);
    },
    [selectedThreadId]
  );

  const openSidebar = useCallback(() => {
    setIsSidebarOpen(true);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const refreshThreads = useCallback(async () => {
    try {
      const nextThreads = await listThreads();
      handleThreadsChange(nextThreads);
    } catch (err) {
      console.error("Failed to refresh threads", err);
    }
  }, [handleThreadsChange]);

  const touchThread = useCallback(
    (threadId: string, options?: { titleCandidate?: string; isFirstMessage?: boolean }) => {
      const now = Date.now();
      const titleCandidate = options?.titleCandidate;
      const derivedTitle =
        titleCandidate && options?.isFirstMessage
          ? deriveThreadTitleFromText(titleCandidate)
          : null;

      setThreads((current) => {
        const next = current.map((thread) => {
          if (thread.id !== threadId) {
            return thread;
          }

          return {
            ...thread,
            title: thread.title || !derivedTitle ? thread.title : derivedTitle,
            updatedAt: now,
          };
        });

        next.sort((left, right) => {
          const diff = right.updatedAt - left.updatedAt;
          if (diff !== 0) {
            return diff;
          }
          return left.id.localeCompare(right.id);
        });

        return next;
      });
    },
    []
  );

  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeSidebar, isSidebarOpen]);

  useEffect(() => {
    if (!selectedThreadId || !isLoadingMessages) {
      return;
    }

    let active = true;

    fetchThreadMessages(selectedThreadId)
      .then((messages) => {
        if (active) {
          setInitialMessages(messages);
          setMessagesByThreadId((current) => ({
            ...current,
            [selectedThreadId]: messages,
          }));

          const derivedTitle = deriveThreadTitleFromMessages(messages);
          if (derivedTitle) {
            setThreads((current) =>
              current.map((thread) => {
                if (thread.id !== selectedThreadId || thread.title) {
                  return thread;
                }
                return { ...thread, title: derivedTitle };
              })
            );
          }
        }
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load messages";
        setMessageError(message);
        setInitialMessages([]);
      })
      .finally(() => {
        if (active) {
          setIsLoadingMessages(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isLoadingMessages, selectedThreadId]);

  const activeThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <div className="h-dvh bg-background text-foreground">
      <div className="relative isolate h-dvh overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(900px circle at 8% -10%, rgba(31, 122, 109, 0.25), transparent 60%), radial-gradient(1000px circle at 100% 0%, rgba(248, 180, 0, 0.2), transparent 55%)",
          }}
        />
        <div className="relative flex h-dvh flex-col lg:flex-row">
          <ThreadSidebar
            className="hidden lg:flex"
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectAction={handleSelectThread}
            onThreadsChangeAction={handleThreadsChange}
          />
          <ChatPanel
            thread={activeThread}
            initialMessages={initialMessages}
            isLoading={isLoadingMessages}
            error={messageError}
            onThreadsRefreshAction={refreshThreads}
            onThreadTouchAction={touchThread}
            onOpenThreadsAction={openSidebar}
          />
        </div>

        {isSidebarOpen ? (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Threads"
            onClick={closeSidebar}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
              className="absolute inset-y-0 left-0 w-[min(22rem,90vw)]"
              onClick={(event) => event.stopPropagation()}
            >
              <ThreadSidebar
                className="h-full w-full border-b-0"
                threads={threads}
                selectedThreadId={selectedThreadId}
                onSelectAction={handleSelectThread}
                onThreadsChangeAction={handleThreadsChange}
                onCloseAction={closeSidebar}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
