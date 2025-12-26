type ConfirmationStatus = "pending" | "approved" | "denied" | "error";

type ConfirmationCardProps = {
  title: string;
  description?: string;
  payload?: unknown;
  status: ConfirmationStatus;
  onApprove?: () => void;
  onReject?: () => void;
  disabled?: boolean;
};

function formatPayload(payload: unknown): string {
  if (payload == null) {
    return "";
  }
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function ConfirmationCard({
  title,
  description,
  payload,
  status,
  onApprove,
  onReject,
  disabled,
}: ConfirmationCardProps) {
  const statusLabel =
    status === "approved"
      ? "Approved"
      : status === "denied"
        ? "Denied"
        : status === "error"
          ? "Error"
          : "Needs confirmation";

  const statusClass =
    status === "approved"
      ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
      : status === "denied"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-[color:var(--border)] bg-[color:var(--surface-muted)] text-[color:var(--muted)]";

  const payloadText = formatPayload(payload);
  const isPending = status === "pending";
  const actionsDisabled = Boolean(disabled) || !isPending;

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
            Confirmation
          </p>
          <h3 className="mt-2 text-base font-semibold text-[color:var(--foreground)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-2 text-sm text-[color:var(--muted)]">{description}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {payloadText ? (
        <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)] p-3 text-xs text-[color:var(--muted)]">
          {payloadText}
        </pre>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApprove}
          disabled={actionsDisabled || !onApprove}
          className="rounded-full bg-[color:var(--accent)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={actionsDisabled || !onReject}
          className="rounded-full border border-[color:var(--border)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--foreground)] disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
