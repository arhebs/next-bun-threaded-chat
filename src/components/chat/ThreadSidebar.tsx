"use client";

import { useEffect, useRef, useState } from "react";
import { unstable_batchedUpdates } from "react-dom";

import { cn } from "@/lib/cn";
import {
  createThread,
  listThreads,
  type Thread,
} from "@/lib/client/api";

type ThreadSidebarProps = {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectAction: (
    threadId: string,
    options?: { skipMessageLoad?: boolean }
  ) => void;
  onThreadsChangeAction: (threads: Thread[]) => void;
  onCloseAction?: () => void;
  className?: string;
};

function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString();
}

function mergeThreads(current: Thread[], incoming: Thread[]): Thread[] {
  const byId = new Map<string, Thread>();

  const consider = (thread: Thread) => {
    const existing = byId.get(thread.id);
    if (!existing) {
      byId.set(thread.id, thread);
      return;
    }

    if (thread.updatedAt > existing.updatedAt) {
      byId.set(thread.id, thread);
      return;
    }

    if (thread.updatedAt === existing.updatedAt && !existing.title && thread.title) {
      byId.set(thread.id, thread);
    }
  };

  for (const thread of current) {
    consider(thread);
  }

  for (const thread of incoming) {
    consider(thread);
  }

  return Array.from(byId.values()).sort((left, right) => {
    const diff = right.updatedAt - left.updatedAt;
    if (diff !== 0) {
      return diff;
    }
    return left.id.localeCompare(right.id);
  });
}

export function ThreadSidebar({
  threads,
  selectedThreadId,
  onSelectAction,
  onThreadsChangeAction,
  onCloseAction,
  className,
}: ThreadSidebarProps) {
  const [isLoading, setIsLoading] = useState(() => threads.length === 0);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateSpinner, setShowCreateSpinner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const threadsRef = useRef(threads);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const isInitialLoading = isLoading && threads.length === 0;

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);

    listThreads()
      .then((data) => {
        if (active) {
          const merged = mergeThreads(threadsRef.current, data);
          threadsRef.current = merged;
          onThreadsChangeAction(merged);
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
    if (isCreating) {
      return;
    }

    const spinnerDelayMs = 200;
    let spinnerTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      setIsCreating(true);
      setShowCreateSpinner(false);
      setError(null);

      spinnerTimeout = setTimeout(() => {
        setShowCreateSpinner(true);
      }, spinnerDelayMs);

      const thread = await createThread();
      const nextThreads = mergeThreads([thread], threadsRef.current);
      threadsRef.current = nextThreads;

      unstable_batchedUpdates(() => {
        onThreadsChangeAction(nextThreads);
        onSelectAction(thread.id, { skipMessageLoad: true });
        onCloseAction?.();
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create thread";
      setError(message);
    } finally {
      if (spinnerTimeout) {
        clearTimeout(spinnerTimeout);
      }
      setShowCreateSpinner(false);
      setIsCreating(false);
    }
  };

  return (
    <aside
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col gap-6 border-b border-border bg-surface p-6 shadow-[0_30px_70px_-60px_rgba(15,23,42,0.35)] lg:w-80 lg:border-b-0 lg:border-r motion-safe:animate-[rise_0.6s_ease-out]",
        className
      )}
    >
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={showCreateSpinner}
            aria-busy={isCreating}
            className="inline-flex items-center rounded-full bg-accent-soft px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent-ink shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            New
            {showCreateSpinner ? (
              <span
                aria-hidden="true"
                className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            {isCreating ? <span className="sr-only">Creating thread</span> : null}
          </button>
          {onCloseAction ? (
            <button
              type="button"
              onClick={onCloseAction}
              className="rounded-full border border-border bg-surface px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background lg:hidden"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        {error ? (
          <div className="rounded-2xl border border-border bg-surface-muted p-4 text-sm text-muted">
            {error}
          </div>
        ) : null}
        {isInitialLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading threads">
            <div className="h-10 rounded-xl bg-surface-muted animate-pulse" />
            <div className="h-10 rounded-xl bg-surface-muted animate-pulse" />
            <div className="h-10 rounded-xl bg-surface-muted animate-pulse" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-muted p-4 text-sm text-muted">
            No threads yet. Start a chat to see history here.
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
            {threads.map((thread) => {
              const isSelected = thread.id === selectedThreadId;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      onCloseAction?.();
                      return;
                    }

                    onSelectAction(thread.id);
                    onCloseAction?.();
                  }}
                  className={cn(
                    "w-full rounded-xl border px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isSelected
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-border bg-surface text-foreground hover:bg-surface-muted"
                  )}
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
