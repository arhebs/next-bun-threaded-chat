export function ThreadSidebar() {
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
          disabled
          className="rounded-full bg-[color:var(--accent-soft)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-ink)] opacity-70"
        >
          New
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-sm text-[color:var(--muted)]">
          No threads yet. Start a chat to see history here.
        </div>
        <div className="space-y-2">
          <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
          <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
          <div className="h-10 rounded-xl bg-[color:var(--surface-muted)]" />
        </div>
      </div>

      <div className="mt-auto rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-4 text-xs text-[color:var(--muted)]">
        Tip: use mentions like <span className="font-mono">@Sheet1!A1:C5</span> to
        reference ranges.
      </div>
    </aside>
  );
}
