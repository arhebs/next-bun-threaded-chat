"use client";

import { useCallback, useEffect, useState } from "react";
import type { UIMessage } from "ai";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThreadSidebar } from "@/components/chat/ThreadSidebar";
import { fetchThreadMessages, type Thread } from "@/lib/client/api";

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

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

  const handleSelectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId);
    setInitialMessages([]);
    setMessageError(null);
    setIsLoadingMessages(true);
  }, []);

  useEffect(() => {
    if (!selectedThreadId) {
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
  }, [selectedThreadId]);

  const activeThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      <div className="relative isolate min-h-screen overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          style={{
            backgroundImage:
              "radial-gradient(900px circle at 8% -10%, rgba(31, 122, 109, 0.25), transparent 60%), radial-gradient(1000px circle at 100% 0%, rgba(248, 180, 0, 0.2), transparent 55%)",
          }}
        />
        <div className="relative flex min-h-screen flex-col lg:flex-row">
          <ThreadSidebar
            threads={threads}
            selectedThreadId={selectedThreadId}
            onSelectAction={handleSelectThread}
            onThreadsChangeAction={handleThreadsChange}
          />
          <ChatPanel
            key={selectedThreadId ?? "none"}
            thread={activeThread}
            initialMessages={initialMessages}
            isLoading={isLoadingMessages}
            error={messageError}
          />
        </div>
      </div>
    </div>
  );
}
