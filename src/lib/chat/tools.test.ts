import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { UIMessage } from "ai";
import * as XLSX from "xlsx";

process.env.DB_PATH = ":memory:";

import { getDb } from "@/lib/db/client";
import { createThread, getThread } from "@/lib/db/threads";
import { __setWorkbookPathForTesting } from "@/lib/xlsx/workbook";

import { tools } from "@/lib/chat/tools";

function createConfirmMessage(output: unknown): UIMessage {
  return {
    id: "assistant-confirm",
    role: "assistant",
    parts: [
      {
        type: "tool-confirmAction",
        toolCallId: "tool-call-1",
        output,
      } as unknown as UIMessage["parts"][number],
    ],
  };
}

function withContext(messages: UIMessage[]) {
  return {
    experimental_context: {
      uiMessages: messages,
    },
  };
}

function getExecute(toolCandidate: unknown): (...args: unknown[]) => Promise<unknown> {
  if (!toolCandidate || typeof toolCandidate !== "object") {
    throw new Error("Tool is missing execute");
  }

  const execute = (toolCandidate as { execute?: unknown }).execute;
  if (typeof execute !== "function") {
    throw new Error("Tool is missing execute");
  }

  return execute as (...args: unknown[]) => Promise<unknown>;
}

function createTempWorkbookCopy(): { workbookPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "xlsx-tool-test-"));
  const workbookPath = join(dir, "example.xlsx");

  const sheet = XLSX.utils.aoa_to_sheet([
    ["ID", "Name", "Email", "Region", "SalesAmount", "Commission"],
    [1, "Ava Chen", "ava.chen@example.com", "North", 12000, 1200],
  ]);

  sheet["F2"] = { t: "n", f: "E2*0.1", v: 1200 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as unknown;
  if (!(buffer instanceof Uint8Array)) {
    throw new Error("XLSX.write did not return a binary buffer.");
  }

  writeFileSync(workbookPath, buffer);

  return {
    workbookPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("chat tools", () => {
  let workbookCleanup: (() => void) | null = null;

  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM consumed_confirmations;");
    db.exec("DELETE FROM messages;");
    db.exec("DELETE FROM threads;");

    workbookCleanup?.();
    const { workbookPath, cleanup } = createTempWorkbookCopy();
    workbookCleanup = cleanup;
    __setWorkbookPathForTesting(workbookPath);
  });

  afterEach(() => {
    __setWorkbookPathForTesting(null);
    workbookCleanup?.();
    workbookCleanup = null;
  });

  it("sendInvites returns the same emails and message", async () => {
    const execute = getExecute(tools.sendInvites) as (input: unknown) => Promise<unknown>;
    const result = await execute({ emails: ["a@example.com"], message: "Hello" });

    expect(result).toEqual({ sent: ["a@example.com"], message: "Hello" });
  });

  it("readRange returns the Sheet1 header row", async () => {
    const execute = getExecute(tools.readRange) as (input: unknown) => Promise<unknown>;
    const result = await execute({ sheet: "Sheet1", range: "A1:F1" });

    const record = result as {
      sheet?: unknown;
      range?: unknown;
      values?: unknown;
    };

    expect(record.sheet).toBe("Sheet1");
    expect(record.range).toBe("A1:F1");
    expect(record.values).toEqual([
      ["ID", "Name", "Email", "Region", "SalesAmount", "Commission"],
    ]);
  });

  it("explainFormula returns the formula string", async () => {
    const execute = getExecute(tools.explainFormula) as (input: unknown) => Promise<unknown>;
    const result = await execute({ sheet: "Sheet1", cell: "f2" });

    const record = result as { formula?: unknown };
    expect(record.formula).toBe("=E2*0.1");
  });

  it("updateCell requires a matching confirmation", async () => {
    const execute = getExecute(tools.updateCell) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    await expect(
      execute({ sheet: "Sheet1", cell: "A1", value: 1 }, withContext([]))
    ).rejects.toThrow("Missing confirmation");
  });

  it("updateCell rejects denied confirmations", async () => {
    const execute = getExecute(tools.updateCell) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: false,
        confirmationToken: "token",
        action: "updateCell",
        actionPayload: { sheet: "Sheet1", cell: "A1", value: 1 },
      }),
    ];

    await expect(
      execute({ sheet: "Sheet1", cell: "A1", value: 1 }, withContext(messages))
    ).rejects.toThrow("Confirmation denied");
  });

  it("updateCell writes to the workbook after approval", async () => {
    const updateExecute = getExecute(tools.updateCell) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    const readExecute = getExecute(tools.readRange) as (input: unknown) => Promise<unknown>;

    const payload = {
      sheet: "Sheet1",
      cell: "B2",
      value: "Updated Name",
    };

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: true,
        confirmationToken: "token",
        action: "updateCell",
        actionPayload: payload,
      }),
    ];

    const result = await updateExecute(payload, withContext(messages));

    expect(result).toEqual(payload);

    const readBack = await readExecute({ sheet: "Sheet1", range: "B2" });
    const readBackRecord = readBack as { values?: unknown };
    expect(readBackRecord.values).toEqual([[payload.value]]);
  });

  it("deleteThread requires a matching confirmation", async () => {
    const execute = getExecute(tools.deleteThread) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    await expect(
      execute({ threadId: "thread-1" }, withContext([]))
    ).rejects.toThrow("Missing confirmation");
  });

  it("deleteThread rejects denied confirmations", async () => {
    const execute = getExecute(tools.deleteThread) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: false,
        confirmationToken: "token",
        action: "deleteThread",
        actionPayload: { threadId: "thread-1" },
      }),
    ];

    await expect(
      execute({ threadId: "thread-1" }, withContext(messages))
    ).rejects.toThrow("Confirmation denied");
  });

  it("deleteThread deletes the thread after approval", async () => {
    const execute = getExecute(tools.deleteThread) as (
      input: unknown,
      options: unknown
    ) => Promise<unknown>;

    const thread = createThread();

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: true,
        confirmationToken: "token",
        action: "deleteThread",
        actionPayload: { threadId: thread.id },
      }),
    ];

    const result = await execute({ threadId: thread.id }, withContext(messages));

    expect(result).toEqual({ threadId: thread.id, deleted: true });
    expect(getThread(thread.id)).toBeNull();
  });
});
