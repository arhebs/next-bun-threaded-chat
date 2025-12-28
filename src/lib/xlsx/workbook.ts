import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const WORKBOOK_RELATIVE_PATH = "data/example.xlsx";

function resolveWorkbookPath(): string {
  const resolved = path.resolve(process.cwd(), WORKBOOK_RELATIVE_PATH);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function loadWorkbook(): XLSX.WorkBook {
  const workbookPath = resolveWorkbookPath();

  let buffer: Uint8Array;
  try {
    buffer = readFileSync(workbookPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read workbook at ${WORKBOOK_RELATIVE_PATH}: ${message}. ` +
        "Run Step 18 to generate the bundled spreadsheet."
    );
  }

  try {
    return XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellText: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse workbook at ${WORKBOOK_RELATIVE_PATH}: ${message}`
    );
  }
}

export function saveWorkbook(workbook: XLSX.WorkBook): void {
  const workbookPath = resolveWorkbookPath();
  const data = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown;

  if (!(data instanceof Uint8Array)) {
    throw new Error("XLSX.write did not return a binary buffer.");
  }

  writeFileSync(workbookPath, data);
}
