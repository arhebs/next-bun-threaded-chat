"use client";

import type { ReactNode } from "react";

import { Modal } from "@/components/ui/Modal";
import type { ReadRangeOutput } from "@/lib/chat/tool-types";
import { columnNumberToLetters, parseRange } from "@/lib/xlsx/range";

type CellValue = string | number | boolean | null;

type TableModalProps = {
  open: boolean;
  data: ReadRangeOutput;
  onCloseAction: () => void;
  footer?: ReactNode;
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

export function TableModal({ open, data, onCloseAction, footer }: TableModalProps) {
  if (!open) {
    return null;
  }

  const parsedRange = parseRange(data.range);
  const startRow = parsedRange.start.row;
  const startCol = parsedRange.start.col;
  const rowCount = data.values.length;
  const colCount = data.values.reduce((max, row) => Math.max(max, row.length), 0);

  const title = `${data.sheet}!${parsedRange.normalized}`;

  return (
    <Modal
      open={open}
      title={title}
      description="Spreadsheet range preview"
      onCloseAction={onCloseAction}
      footer={footer}
    >
      <div className="rounded-2xl border border-border bg-surface">
        <div className="max-h-[65vh] overflow-auto">
          <table
            className="min-w-full border-collapse text-left text-xs"
            aria-label={`Grid ${title}`}
          >
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-border bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted" />
                {Array.from({ length: colCount }).map((_, colIndex) => {
                  const colNumber = startCol + colIndex;
                  const label = columnNumberToLetters(colNumber);
                  return (
                    <th
                      key={`col-${colIndex}`}
                      className="sticky top-0 z-10 border-b border-border bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted"
                      scope="col"
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, rowIndex) => {
                const rowNumber = startRow + rowIndex;
                const rowValues = data.values[rowIndex] ?? [];

                return (
                  <tr key={`row-${rowIndex}`} className="border-b border-border last:border-0">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted"
                    >
                      {rowNumber}
                    </th>
                    {Array.from({ length: colCount }).map((_, colIndex) => {
                      const value = (rowValues[colIndex] ?? null) as CellValue;
                      const formatted = formatCellValue(value);

                      return (
                        <td
                          key={`cell-${rowIndex}-${colIndex}`}
                          data-row={rowIndex}
                          data-col={colIndex}
                          className="max-w-64 border-r border-border px-3 py-2 align-top text-sm text-foreground last:border-0"
                        >
                          <div className="truncate" title={formatted}>
                            {formatted}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
