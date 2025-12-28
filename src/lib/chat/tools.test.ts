import { beforeEach, describe, expect, it } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { UIMessage } from "ai";

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
      } as any,
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

function createTempWorkbookCopy(): { workbookPath: string; cleanup: () => void } {
  const source = resolve(process.cwd(), "data/example.xlsx");
  const dir = mkdtempSync(join(tmpdir(), "xlsx-tool-test-"));
  const workbookPath = join(dir, "example.xlsx");
  copyFileSync(source, workbookPath);

  return {
    workbookPath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

describe("chat tools", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM messages;");
    db.exec("DELETE FROM threads;");
  });

  it("sendInvites returns the same emails and message", async () => {
    const execute = (tools.sendInvites as any).execute as (input: any) => Promise<any>;
    const result = await execute({ emails: ["a@example.com"], message: "Hello" });

    expect(result).toEqual({ sent: ["a@example.com"], message: "Hello" });
  });

  it("readRange returns the Sheet1 header row", async () => {
    const execute = (tools.readRange as any).execute as (input: any) => Promise<any>;
    const result = await execute({ sheet: "Sheet1", range: "A1:F1" });

    expect(result.sheet).toBe("Sheet1");
    expect(result.range).toBe("A1:F1");
    expect(result.values).toEqual([
      ["ID", "Name", "Email", "Region", "SalesAmount", "Commission"],
    ]);
  });

  it("explainFormula returns the formula string", async () => {
    const execute = (tools.explainFormula as any).execute as (input: any) => Promise<any>;
    const result = await execute({ sheet: "Sheet1", cell: "f2" });

    expect(result.formula).toBe("=E2*0.1");
  });

  it("updateCell requires a matching confirmation", async () => {
    const execute = (tools.updateCell as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    await expect(
      execute(
        { sheet: "Sheet1", cell: "A1", value: 1, confirmationToken: "token" },
        withContext([])
      )
    ).rejects.toThrow("Missing confirmation");
  });

  it("updateCell rejects denied confirmations", async () => {
    const execute = (tools.updateCell as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: false,
        confirmationToken: "token",
        action: "updateCell",
        actionPayload: { sheet: "Sheet1", cell: "A1", value: 1 },
      }),
    ];

    await expect(
      execute(
        { sheet: "Sheet1", cell: "A1", value: 1, confirmationToken: "token" },
        withContext(messages)
      )
    ).rejects.toThrow("Confirmation denied");
  });

  it("updateCell writes to the workbook after approval", async () => {
    const updateExecute = (tools.updateCell as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const readExecute = (tools.readRange as any).execute as (input: any) => Promise<any>;

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

    const { workbookPath, cleanup } = createTempWorkbookCopy();
    __setWorkbookPathForTesting(workbookPath);

    try {
      const result = await updateExecute(
        { ...payload, confirmationToken: "token" },
        withContext(messages)
      );

      expect(result).toEqual(payload);

      const readBack = await readExecute({ sheet: "Sheet1", range: "B2" });
      expect(readBack.values).toEqual([[payload.value]]);
    } finally {
      __setWorkbookPathForTesting(null);
      cleanup();
    }
  });

  it("deleteThread requires a matching confirmation", async () => {
    const execute = (tools.deleteThread as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    await expect(
      execute(
        { threadId: "thread-1", confirmationToken: "token" },
        withContext([])
      )
    ).rejects.toThrow("Missing confirmation");
  });

  it("deleteThread rejects denied confirmations", async () => {
    const execute = (tools.deleteThread as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: false,
        confirmationToken: "token",
        action: "deleteThread",
        actionPayload: { threadId: "thread-1" },
      }),
    ];

    await expect(
      execute(
        { threadId: "thread-1", confirmationToken: "token" },
        withContext(messages)
      )
    ).rejects.toThrow("Confirmation denied");
  });

  it("deleteThread deletes the thread after approval", async () => {
    const execute = (tools.deleteThread as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const thread = createThread();

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: true,
        confirmationToken: "token",
        action: "deleteThread",
        actionPayload: { threadId: thread.id },
      }),
    ];

    const result = await execute(
      { threadId: thread.id, confirmationToken: "token" },
      withContext(messages)
    );

    expect(result).toEqual({ threadId: thread.id, deleted: true });
    expect(getThread(thread.id)).toBeNull();
  });
});
