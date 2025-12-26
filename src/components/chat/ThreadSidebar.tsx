"use client";

import { useEffect, useState } from "react";

import {
  createThread,
  listThreads,
  type Thread,
} from "@/lib/client/api";

type ThreadSidebarProps = {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectAction: (threadId: string) => void;
  onThreadsChangeAction: (threads: Thread[]) => void;
};

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString();
}

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onSelectAction,
  onThreadsChangeAction,
}: ThreadSidebarProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);

    listThreads()
      .then((data) => {
        if (active) {
          onThreadsChangeAction(data);
        }
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load threads";
        setError(message);
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [onThreadsChangeAction]);

  const handleCreate = async () => {
    try {
      setIsCreating(true);
      setError(null);
      const thread = await createThread();
      const nextThreads = [thread, ...threads];
      onThreadsChangeAction(nextThreads);
      onSelectAction(thread.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create thread";
      setError(message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <aside className="relative flex w-full flex-col gap-6 border-b border-border bg-surface p-6 shadow-[0_30px_70px_-60px_rgba(15,23,42,0.35)] lg:h-screen lg:w-80 lg:border-b-0 lg:border-r motion-safe:animate-[rise_0.6s_ease-out]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            Threads
          </p>
          <h1 className="mt-3 text-xl font-semibold text-foreground">
            Threaded Sheet Chat
          </h1>
          <p className="mt-2 text-sm text-muted">
            Organize conversations by intent and data range.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="rounded-full bg-accent-soft px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-ink transition hover:opacity-90 disabled:opacity-60"
        >
          {isCreating ? "Creating" : "New"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {error ? (
          <div className="rounded-2xl border border-border bg-surface-muted p-4 text-sm text-muted">
            {error}
          </div>
        ) : null}
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-xl bg-surface-muted" />
            <div className="h-10 rounded-xl bg-surface-muted" />
            <div className="h-10 rounded-xl bg-surface-muted" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted">
            No threads yet. Start a chat to see history here.
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map((thread) => {
              const isSelected = thread.id === selectedThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelectAction(thread.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border bg-surface text-foreground hover:bg-surface-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {thread.title || "Untitled thread"}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-muted">
                      {formatShortDate(thread.updatedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto rounded-2xl border border-border bg-surface-muted p-4 text-xs text-muted">
        Tip: use mentions like <span className="font-mono">@Sheet1!A1:C5</span> to
        reference ranges.
      </div>
    </aside>
  );
}
