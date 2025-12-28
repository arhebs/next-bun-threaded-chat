import * as XLSX from "xlsx";

import { loadWorkbook } from "./workbook";
import { parseRange, toA1Cell } from "./range";

export type CellValue = string | number | boolean | null;

export type ReadRangeResult = {
  sheet: "Sheet1";
  range: string;
  values: CellValue[][];
};

function assertSheetName(sheet: string): asserts sheet is "Sheet1" {
  if (sheet !== "Sheet1") {
    throw new Error(`Only Sheet1 is supported (got ${sheet}).`);
  }
}

function coerceCellValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell) {
    return null;
  }

  const value = cell.v as unknown;
  if (value == null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function readRange(input: {
  sheet: string;
  range: string;
}): ReadRangeResult {
  assertSheetName(input.sheet);
  const parsed = parseRange(input.range);

  const workbook = loadWorkbook();
  const worksheet = workbook.Sheets[input.sheet];
  if (!worksheet) {
    throw new Error(`Workbook is missing required sheet ${input.sheet}.`);
  }

  const values: CellValue[][] = [];

  for (let row = parsed.start.row; row <= parsed.end.row; row++) {
    const rowValues: CellValue[] = [];

    for (let col = parsed.start.col; col <= parsed.end.col; col++) {
      const address = toA1Cell({ row, col });
      const cell = worksheet[address] as XLSX.CellObject | undefined;
      rowValues.push(coerceCellValue(cell));
    }

    values.push(rowValues);
  }

  return {
    sheet: input.sheet,
    range: parsed.normalized,
    values,
  };
}
