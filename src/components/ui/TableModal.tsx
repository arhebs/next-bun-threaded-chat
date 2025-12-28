"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import type { ReadRangeOutput } from "@/lib/chat/tool-types";
import {
  columnNumberToLetters,
  parseRange,
  selectionToA1Range,
} from "@/lib/xlsx/range";

type CellValue = string | number | boolean | null;

type GridPoint = {
  rowIndex: number;
  colIndex: number;
};

type GridSelection = {
  startRowIndex: number;
  startColIndex: number;
  endRowIndex: number;
  endColIndex: number;
};

type TableModalProps = {
  open: boolean;
  data: ReadRangeOutput;
  onCloseAction: () => void;
  onInsertMentionAction: (mention: string) => void;
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

export function TableModal({
  open,
  data,
  onCloseAction,
  onInsertMentionAction,
}: TableModalProps) {
  const parsedRange = useMemo(() => parseRange(data.range), [data.range]);
  const startRow = parsedRange.start.row;
  const startCol = parsedRange.start.col;
  const rowCount = data.values.length;
  const colCount = data.values.reduce((max, row) => Math.max(max, row.length), 0);

  const title = `${data.sheet}!${parsedRange.normalized}`;

  const [isDragging, setIsDragging] = useState(false);
  const [selectionStart, setSelectionStart] = useState<GridPoint | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<GridPoint | null>(null);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  const selection = useMemo<GridSelection | null>(() => {
    if (!selectionStart || !selectionEnd) {
      return null;
    }

    return {
      startRowIndex: Math.min(selectionStart.rowIndex, selectionEnd.rowIndex),
      startColIndex: Math.min(selectionStart.colIndex, selectionEnd.colIndex),
      endRowIndex: Math.max(selectionStart.rowIndex, selectionEnd.rowIndex),
      endColIndex: Math.max(selectionStart.colIndex, selectionEnd.colIndex),
    };
  }, [selectionStart, selectionEnd]);

  const selectedRange = useMemo(() => {
    if (!selection) {
      return null;
    }

    try {
      return selectionToA1Range(data.range, selection);
    } catch {
      return null;
    }
  }, [data.range, selection]);

  const mention = selectedRange ? `@${data.sheet}!${selectedRange}` : null;

  const footerContent = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-[12rem]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Selection
        </p>
        <p
          className={`mt-1 font-mono text-sm ${
            mention ? "text-foreground" : "text-muted"
          }`}
        >
          {mention ?? "Drag to select cells"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setIsDragging(false);
            setSelectionStart(null);
            setSelectionEnd(null);
          }}
          disabled={!selection}
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted transition hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => {
            if (!mention) {
              return;
            }
            onInsertMentionAction(mention);
            onCloseAction();
          }}
          disabled={!mention}
          className="rounded-full bg-accent px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          Insert mention
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      title={title}
      description="Spreadsheet range preview"
      onCloseAction={onCloseAction}
      footer={footerContent}
    >
      <div className="rounded-2xl border border-border bg-surface">
        <div className="max-h-[65vh] overflow-auto">
            <table
              className="min-w-full select-none border-collapse text-left text-xs"
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
                      const colNumber = startCol + colIndex;
                      const cellAddress = `${columnNumberToLetters(colNumber)}${rowNumber}`;
                      const isSelected =
                        selection != null &&
                        rowIndex >= selection.startRowIndex &&
                        rowIndex <= selection.endRowIndex &&
                        colIndex >= selection.startColIndex &&
                        colIndex <= selection.endColIndex;

                      return (
                        <td
                          key={`cell-${rowIndex}-${colIndex}`}
                          data-row={rowIndex}
                          data-col={colIndex}
                          aria-label={`Cell ${cellAddress}`}
                          aria-selected={isSelected}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setIsDragging(true);
                            setSelectionStart({ rowIndex, colIndex });
                            setSelectionEnd({ rowIndex, colIndex });
                          }}
                          onMouseEnter={() => {
                            if (!isDragging) {
                              return;
                            }
                            setSelectionEnd({ rowIndex, colIndex });
                          }}
                          onMouseUp={() => {
                            setIsDragging(false);
                            setSelectionEnd({ rowIndex, colIndex });
                          }}
                          className={`max-w-64 border-r border-border px-3 py-2 align-top text-sm text-foreground last:border-0 cursor-crosshair ${
                            isSelected ? "bg-accent-soft/50" : ""
                          }`}
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
