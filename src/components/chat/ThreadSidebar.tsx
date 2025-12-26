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
    <aside className="relative flex w-full flex-col gap-6 border-b border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_30px_70px_-60px_rgba(15,23,42,0.35)] lg:h-screen lg:w-80 lg:border-b-0 lg:border-r motion-safe:animate-[rise_0.6s_ease-out]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
            Threads
          </p>
          <h1 className="mt-3 text-xl font-semibold text-[color:var(--foreground)]">
            Threaded Sheet Chat
          </h1>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Organize conversations by intent and data range.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={isCreating}
          className="rounded-full bg-[color:var(--accent-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-ink)] transition hover:opacity-90 disabled:opacity-60"
        >
          {isCreating ? "Creating" : "New"}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3">
        {error ? (
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted)]">
            {error}
          </div>
        ) : null}
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
            <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
            <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
          </div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted)]">
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
                      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                      : "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--foreground)] hover:bg-[color:var(--surface-muted)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold">
                      {thread.title || "Untitled thread"}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      {formatShortDate(thread.updatedAt)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-xs text-[color:var(--muted)]">
        Tip: use mentions like <span className="font-mono">@Sheet1!A1:C5</span> to
        reference ranges.
      </div>
    </aside>
  );
}
