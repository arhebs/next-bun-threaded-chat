type ToolJsonViewProps = {
  title?: string;
  payload: unknown;
  defaultOpen?: boolean;
};

function formatJsonPayload(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export function ToolJsonView({
  title = "Tool output (JSON)",
  payload,
  defaultOpen,
}: ToolJsonViewProps) {
  const json = formatJsonPayload(payload);

  return (
    <details
      className="group rounded-2xl border border-dashed border-border bg-surface-muted p-3"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background">
        {title}
      </summary>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-border bg-surface p-3 font-mono text-xs text-foreground">
        {json}
      </pre>
    </details>
  );
}
