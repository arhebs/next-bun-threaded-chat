const MAX_EXCEL_ROWS = 1_048_576;
const MAX_EXCEL_COLS = 16_384;

export const MAX_RANGE_CELLS = 10_000;

export type CellAddress = {
  row: number;
  col: number;
};

export type ParsedRange = {
  start: CellAddress;
  end: CellAddress;
  normalized: string;
  width: number;
  height: number;
  cellCount: number;
};

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function assertWithinExcelBounds(address: CellAddress): void {
  if (!isPositiveInteger(address.row)) {
    throw new Error(`Row index must be a positive integer (got ${address.row}).`);
  }
  if (!isPositiveInteger(address.col)) {
    throw new Error(
      `Column index must be a positive integer (got ${address.col}).`
    );
  }
  if (address.row > MAX_EXCEL_ROWS) {
    throw new Error(
      `Row index ${address.row} exceeds Excel max row ${MAX_EXCEL_ROWS}.`
    );
  }
  if (address.col > MAX_EXCEL_COLS) {
    throw new Error(
      `Column index ${address.col} exceeds Excel max column ${MAX_EXCEL_COLS}.`
    );
  }
}

export function columnLettersToNumber(columnLetters: string): number {
  const normalized = columnLetters.trim().toUpperCase();
  if (!normalized) {
    throw new Error("Column letters cannot be empty.");
  }

  let value = 0;
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) {
      throw new Error(`Invalid column letter: ${columnLetters}`);
    }
    value = value * 26 + (code - 64);
  }

  return value;
}

export function columnNumberToLetters(columnNumber: number): string {
  if (!isPositiveInteger(columnNumber)) {
    throw new Error(`Column number must be a positive integer (got ${columnNumber}).`);
  }

  let value = columnNumber;
  let letters = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }

  return letters;
}

export function parseA1Cell(cell: string): CellAddress {
  const trimmed = cell.trim();
  if (!trimmed) {
    throw new Error("Cell reference cannot be empty.");
  }

  const match = /^\$?([A-Za-z]{1,3})\$?([1-9]\d*)$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid A1 cell reference: ${cell}`);
  }

  const col = columnLettersToNumber(match[1]);
  const row = Number(match[2]);
  const address = { row, col };
  assertWithinExcelBounds(address);
  return address;
}

export function toA1Cell(address: CellAddress): string {
  assertWithinExcelBounds(address);
  return `${columnNumberToLetters(address.col)}${address.row}`;
}

export function normalizeA1Cell(cell: string): string {
  return toA1Cell(parseA1Cell(cell));
}

function normalizeRangeEndpoints(start: CellAddress, end: CellAddress): {
  start: CellAddress;
  end: CellAddress;
} {
  const normalizedStart = {
    row: Math.min(start.row, end.row),
    col: Math.min(start.col, end.col),
  };
  const normalizedEnd = {
    row: Math.max(start.row, end.row),
    col: Math.max(start.col, end.col),
  };

  return { start: normalizedStart, end: normalizedEnd };
}

export function toA1Range(start: CellAddress, end: CellAddress): string {
  const normalized = normalizeRangeEndpoints(start, end);
  const startRef = toA1Cell(normalized.start);
  const endRef = toA1Cell(normalized.end);
  return startRef === endRef ? startRef : `${startRef}:${endRef}`;
}

export function parseRange(
  range: string,
  options?: {
    maxCells?: number;
  }
): ParsedRange {
  const trimmed = range.trim();
  if (!trimmed) {
    throw new Error("Range cannot be empty.");
  }
  if (trimmed.includes("!")) {
    throw new Error(
      `Range must not include a sheet name (got ${range}). Pass sheet separately.`
    );
  }

  const parts = trimmed.split(":");
  if (parts.length > 2) {
    throw new Error(`Invalid A1 range: ${range}`);
  }

  const start = parseA1Cell(parts[0]);
  const end = parts.length === 2 ? parseA1Cell(parts[1]) : start;
  const normalized = normalizeRangeEndpoints(start, end);

  const width = normalized.end.col - normalized.start.col + 1;
  const height = normalized.end.row - normalized.start.row + 1;
  const cellCount = width * height;
  const maxCells = options?.maxCells ?? MAX_RANGE_CELLS;

  if (cellCount > maxCells) {
    throw new Error(
      `Range ${toA1Range(normalized.start, normalized.end)} spans ${cellCount} cells, exceeding limit ${maxCells}.`
    );
  }

  return {
    start: normalized.start,
    end: normalized.end,
    normalized: toA1Range(normalized.start, normalized.end),
    width,
    height,
    cellCount,
  };
}

export type GridSelection = {
  startRowIndex: number;
  startColIndex: number;
  endRowIndex: number;
  endColIndex: number;
};

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer (got ${value}).`);
  }
}

export function selectionToA1Range(baseRange: string, selection: GridSelection): string {
  const base = parseRange(baseRange);

  assertNonNegativeInteger(selection.startRowIndex, "startRowIndex");
  assertNonNegativeInteger(selection.startColIndex, "startColIndex");
  assertNonNegativeInteger(selection.endRowIndex, "endRowIndex");
  assertNonNegativeInteger(selection.endColIndex, "endColIndex");

  const startRowIndex = Math.min(selection.startRowIndex, selection.endRowIndex);
  const endRowIndex = Math.max(selection.startRowIndex, selection.endRowIndex);
  const startColIndex = Math.min(selection.startColIndex, selection.endColIndex);
  const endColIndex = Math.max(selection.startColIndex, selection.endColIndex);

  const maxRowOffset = base.end.row - base.start.row;
  const maxColOffset = base.end.col - base.start.col;

  if (endRowIndex > maxRowOffset || endColIndex > maxColOffset) {
    throw new Error(
      `Selection exceeds base range ${base.normalized}. Selection end offsets (${endRowIndex}, ${endColIndex}) exceed (${maxRowOffset}, ${maxColOffset}).`
    );
  }

  const start = {
    row: base.start.row + startRowIndex,
    col: base.start.col + startColIndex,
  };

  const end = {
    row: base.start.row + endRowIndex,
    col: base.start.col + endColIndex,
  };

  return toA1Range(start, end);
}

export function normalizeA1Range(range: string): string {
  return parseRange(range, { maxCells: Number.MAX_SAFE_INTEGER }).normalized;
}
