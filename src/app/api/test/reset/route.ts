import { copyFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_WORKBOOK_PATH = "data/example.xlsx";

function resolveUnderCwd(configuredPath: string): string {
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);
}

function assertPathWithin(dir: string, candidate: string): void {
  const resolvedDir = path.resolve(dir) + path.sep;
  const resolvedCandidate = path.resolve(candidate);
  if (!resolvedCandidate.startsWith(resolvedDir)) {
    throw new Error(`Refusing to write outside ${dir}.`);
  }
}

export async function POST(): Promise<Response> {
  if (process.env.PLAYWRIGHT !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const db = getDb();
    db.exec("DELETE FROM consumed_confirmations;");
    db.exec("DELETE FROM messages;");
    db.exec("DELETE FROM threads;");

    const workbookPath = process.env.WORKBOOK_PATH?.trim();
    if (workbookPath) {
      const resolvedWorkbook = resolveUnderCwd(workbookPath);
      const testResultsRoot = path.resolve(process.cwd(), "test-results");
      assertPathWithin(testResultsRoot, resolvedWorkbook);

      const resolvedDefault = resolveUnderCwd(DEFAULT_WORKBOOK_PATH);
      copyFileSync(resolvedDefault, resolvedWorkbook);
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("POST /api/test/reset failed", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
