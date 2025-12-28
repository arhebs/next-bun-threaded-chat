import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_PATH = "data/example.xlsx";

function resolveWorkbookPath(): { resolvedPath: string; configuredPath: string } {
  const envPath = process.env.XLSX_PATH?.trim();
  const configuredPath = envPath && envPath.length > 0 ? envPath : DEFAULT_WORKBOOK_PATH;
  const resolvedPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  return { resolvedPath, configuredPath };
}

export function loadWorkbook(): XLSX.WorkBook {
  const { resolvedPath, configuredPath } = resolveWorkbookPath();

  let buffer: Uint8Array;
  try {
    buffer = readFileSync(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint =
      configuredPath === DEFAULT_WORKBOOK_PATH
        ? "Run Step 18 to generate the bundled spreadsheet."
        : "Check XLSX_PATH and file permissions.";

    throw new Error(`Failed to read workbook at ${configuredPath}: ${message}. ${hint}`);
  }

  try {
    return XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellText: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse workbook at ${configuredPath}: ${message}`);
  }
}

export function saveWorkbook(workbook: XLSX.WorkBook): void {
  const { resolvedPath, configuredPath } = resolveWorkbookPath();
  const data = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as unknown;

  if (!(data instanceof Uint8Array)) {
    throw new Error("XLSX.write did not return a binary buffer.");
  }

  try {
    writeFileSync(resolvedPath, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write workbook at ${configuredPath}: ${message}`);
  }
}
