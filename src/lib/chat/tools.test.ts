import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

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

describe("chat tools", () => {
  it("sendInvites returns the same emails and message", async () => {
    const execute = (tools.sendInvites as any).execute as (input: any) => Promise<any>;
    const result = await execute({ emails: ["a@example.com"], message: "Hello" });

    expect(result).toEqual({ sent: ["a@example.com"], message: "Hello" });
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

  it("updateCell reaches implementation only after approval", async () => {
    const execute = (tools.updateCell as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: true,
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
    ).rejects.toThrow("updateCell not implemented");
  });

  it("deleteThread reaches implementation only after approval", async () => {
    const execute = (tools.deleteThread as any).execute as (
      input: any,
      options: any
    ) => Promise<any>;

    const messages: UIMessage[] = [
      createConfirmMessage({
        approved: true,
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
    ).rejects.toThrow("deleteThread not implemented");
  });
});
