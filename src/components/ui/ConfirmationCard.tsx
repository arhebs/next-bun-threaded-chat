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
      ? "border-accent bg-accent-soft text-accent-ink"
      : status === "denied"
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/25 dark:text-red-200"
        : status === "error"
          ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/40 dark:bg-red-950/25 dark:text-red-200"
          : "border-border bg-surface-muted text-muted";

  const payloadText = formatPayload(payload);
  const isPending = status === "pending";
  const showActions = isPending && (onApprove || onReject);
  const actionsDisabled = Boolean(disabled);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted">
            Confirmation
          </p>
          <h3 className="mt-2 text-base font-semibold text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="mt-2 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {payloadText ? (
        <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-dashed border-border bg-surface-muted p-3 text-xs text-muted">
          {payloadText}
        </pre>
      ) : null}

      {showActions ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {onApprove ? (
            <button
              type="button"
              onClick={onApprove}
              disabled={actionsDisabled}
              className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            >
              Approve
            </button>
          ) : null}
          {onReject ? (
            <button
              type="button"
              onClick={onReject}
              disabled={actionsDisabled}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
            >
              Decline
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
