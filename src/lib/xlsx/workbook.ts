import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_PATH = "data/example.xlsx";

let workbookPathOverride: string | null = null;

export function __setWorkbookPathForTesting(workbookPath: string | null): void {
  workbookPathOverride = workbookPath;
}

function resolveWorkbookPath(): { resolvedPath: string; configuredPath: string } {
  const envPath = process.env.WORKBOOK_PATH?.trim();
  const configuredPath =
    workbookPathOverride ??
    (envPath && envPath.length > 0 ? envPath : null) ??
    DEFAULT_WORKBOOK_PATH;

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

  const directory = path.dirname(resolvedPath);
  const tempPath = path.join(
    directory,
    `.tmp-${path.basename(resolvedPath)}-${randomUUID()}`
  );

  try {
    writeFileSync(tempPath, data);
    renameSync(tempPath, resolvedPath);
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // ignore cleanup errors
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write workbook at ${configuredPath}: ${message}`);
  }
}
