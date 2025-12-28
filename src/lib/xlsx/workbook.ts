import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_PATH = "data/example.xlsx";

let workbookPathOverride: string | null = null;

export function __setWorkbookPathForTesting(path: string | null): void {
  workbookPathOverride = path;
}

function resolveWorkbookPath(): { resolvedPath: string; configuredPath: string } {
  const configuredPath = workbookPathOverride ?? DEFAULT_WORKBOOK_PATH;
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
        ? "Expected a bundled workbook at data/example.xlsx. Run `bun run scripts/generate-example-xlsx.ts` to generate it."
        : "Check that the workbook exists and is readable.";

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
