type CellValue = string | number | boolean | null;

type TablePreviewProps = {
  values: CellValue[][];
  caption?: string;
  maxRows?: number;
  maxCols?: number;
  selected?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
};

function formatCellValue(value: CellValue): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }

  return value ? "true" : "false";
}

export function TablePreview({
  values,
  caption,
  maxRows = 8,
  maxCols = 6,
  selected,
  onClick,
  ariaLabel = "Range preview",
}: TablePreviewProps) {
  const totalRows = values.length;
  const totalCols = values.reduce((max, row) => Math.max(max, row.length), 0);
  const visibleRows = values.slice(0, maxRows);
  const visibleCols = Math.min(maxCols, totalCols);

  const clippedRows = totalRows > maxRows;
  const clippedCols = totalCols > maxCols;

  const containerClass = selected
    ? "border-accent bg-accent-soft/20"
    : "border-border bg-surface-muted";

  const interactiveClass = onClick
    ? "cursor-pointer transition hover:border-accent hover:bg-accent-soft/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    : "";

  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`rounded-2xl border p-3 ${containerClass} ${interactiveClass}`}
    >
      <table
        className="w-full table-fixed border-collapse text-left text-xs"
        aria-label={ariaLabel}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <tbody>
          {visibleRows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="border-b border-border last:border-0">
              {Array.from({ length: visibleCols }).map((_, colIndex) => {
                const value = row[colIndex] ?? null;
                const formatted = formatCellValue(value);

                if (rowIndex === 0) {
                  return (
                    <th
                      key={`cell-${rowIndex}-${colIndex}`}
                      scope="col"
                      className="truncate p-2 font-semibold text-foreground"
                    >
                      {formatted}
                    </th>
                  );
                }

                return (
                  <td
                    key={`cell-${rowIndex}-${colIndex}`}
                    className="truncate p-2 text-muted"
                  >
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {clippedRows || clippedCols ? (
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Showing {Math.min(totalRows, maxRows)} of {totalRows} rows
          {totalCols > 0 ? `, ${Math.min(totalCols, maxCols)} of ${totalCols} cols` : ""}
        </p>
      ) : null}
    </div>
  );
}
