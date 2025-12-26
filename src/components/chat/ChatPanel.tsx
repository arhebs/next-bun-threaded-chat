export function ChatPanel() {
  return (
    <section className="flex min-h-[calc(100vh-120px)] flex-1 flex-col gap-6 p-6 lg:h-screen motion-safe:animate-[rise_0.7s_ease-out_0.1s_both]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
            Active thread
          </p>
          <h2 className="mt-3 text-2xl font-semibold text-[color:var(--foreground)]">
            New thread
          </h2>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            Messages will persist when you start chatting.
          </p>
        </div>
        <span className="rounded-full border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Ready
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-4">
        <div className="flex-1 rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-6 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.35)]">
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-base font-medium text-[color:var(--foreground)]">
              Your chat will appear here.
            </p>
            <p className="text-sm text-[color:var(--muted)]">
              Ask about Sheet1 or paste a mention to preview a range.
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
          <div className="flex flex-col gap-3">
            <textarea
              disabled
              placeholder="Type a message to get started..."
              className="min-h-[96px] resize-none bg-transparent text-sm text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-[color:var(--muted)]">
                Mentions: <span className="font-mono">@Sheet1!A1:C5</span>
              </span>
              <button
                type="button"
                disabled
                className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white opacity-70"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
