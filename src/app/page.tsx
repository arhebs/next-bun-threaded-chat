"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { fetchThreadMessages, listThreads, type Thread } from "@/lib/client/api";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleThreadsChange = useCallback((nextThreads: Thread[]) => {
    setThreads(nextThreads);
    setSelectedThreadId((current) => {
      if (nextThreads.length === 0) {
        setInitialMessages([]);
        setMessageError(null);
        setIsLoadingMessages(false);
        return null;
      }

      const currentIsValid = Boolean(
        current && nextThreads.some((thread) => thread.id === current)
      );

      const nextId = currentIsValid ? current : nextThreads[0]?.id ?? null;

      if (nextId && nextId !== current) {
        setInitialMessages([]);
        setMessageError(null);
        setIsLoadingMessages(true);
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

      setSelectedThreadId(threadId);
      setInitialMessages([]);
      setMessageError(null);

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
