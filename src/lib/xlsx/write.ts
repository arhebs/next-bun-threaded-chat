import * as XLSX from "xlsx";

import { parseA1Cell, toA1Cell } from "./range";

export type CellValue = string | number | boolean | null;

export type UpdateCellResult = {
  workbook: XLSX.WorkBook;
  sheet: "Sheet1";
  cell: string;
  value: CellValue;
};

type UpdateCellInput = {
  sheet: string;
  cell: string;
  value: CellValue;
};

function assertSheetName(sheet: string): asserts sheet is "Sheet1" {
  if (sheet !== "Sheet1") {
    throw new Error(`Only Sheet1 is supported (got ${sheet}).`);
  }
}

function getOrCreateSheet(
  workbook: XLSX.WorkBook,
  sheetName: "Sheet1"
): XLSX.WorkSheet {
  const existing = workbook.Sheets[sheetName];
  if (existing) {
    return existing;
  }

  const created = XLSX.utils.aoa_to_sheet([]);
  workbook.Sheets[sheetName] = created;
  if (!workbook.SheetNames.includes(sheetName)) {
    workbook.SheetNames.push(sheetName);
  }
  return created;
}

function ensureSheetRefIncludesCell(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number
): void {
  const cellRef = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const existingRef = sheet["!ref"];

  let decoded: XLSX.Range;
  try {
    decoded = existingRef ? XLSX.utils.decode_range(existingRef) : XLSX.utils.decode_range(cellRef);
  } catch {
    decoded = XLSX.utils.decode_range(cellRef);
  }

  decoded.s.r = Math.min(decoded.s.r, row - 1);
  decoded.s.c = Math.min(decoded.s.c, col - 1);
  decoded.e.r = Math.max(decoded.e.r, row - 1);
  decoded.e.c = Math.max(decoded.e.c, col - 1);

  sheet["!ref"] = XLSX.utils.encode_range(decoded);
}

function buildCellObject(value: Exclude<CellValue, null>): XLSX.CellObject {
  if (typeof value === "string") {
    if (value.startsWith("=") && value.length > 1) {
      return {
        t: "n",
        f: value.slice(1),
        v: 0,
      };
    }

    return {
      t: "s",
      v: value,
    };
  }

  if (typeof value === "number") {
    return {
      t: "n",
      v: value,
    };
  }

  return {
    t: "b",
    v: value,
  };
}

export function updateCellInWorkbook(
  workbook: XLSX.WorkBook,
  input: UpdateCellInput
): UpdateCellResult {
  assertSheetName(input.sheet);
  const worksheet = getOrCreateSheet(workbook, input.sheet);

  const parsedCell = parseA1Cell(input.cell);
  const normalizedCell = toA1Cell(parsedCell);

  if (input.value === null) {
    delete (worksheet as Record<string, unknown>)[normalizedCell];
    return {
      workbook,
      sheet: input.sheet,
      cell: normalizedCell,
      value: input.value,
    };
  }

  (worksheet as Record<string, unknown>)[normalizedCell] = buildCellObject(input.value);
  ensureSheetRefIncludesCell(worksheet, parsedCell.row, parsedCell.col);

  return {
    workbook,
    sheet: input.sheet,
    cell: normalizedCell,
    value: input.value,
  };
}
