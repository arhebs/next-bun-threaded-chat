import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { UIMessage } from "ai";

process.env.DB_PATH = ":memory:";
process.env.OPENAI_API_KEY = "test";

type GlobalWithDeleteThreadHelper = typeof globalThis & {
  __deleteThreadTestHelper?: (threadId: string) => void;
};

let deleteThreadBeforeFinish: string | null = null;
let capturedSystem: string | null = null;
let streamTextShouldThrow = false;

mock.module("ai", () => {
  let counter = 0;

  return {
    tool: (definition: any) => definition,
    zodSchema: (schema: any) => schema,
    createUIMessageStream: () => {
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    },
    createUIMessageStreamResponse: () => {
      return new Response("ok", { status: 200 });
    },
    convertToModelMessages: async (messages: any) => messages,
    validateUIMessages: async ({ messages, tools }: any) => {
      if (!Array.isArray(messages)) {
        throw new Error("messages must be an array");
      }

      for (const message of messages) {
        if (!message || typeof message !== "object") {
          throw new Error("message must be an object");
        }

        const record = message as Record<string, unknown>;
        const parts = record.parts;
        if (!Array.isArray(parts) || parts.length === 0) {
          throw new Error("message.parts must be a non-empty array");
        }

        for (const part of parts) {
          if (!part || typeof part !== "object") {
            continue;
          }

          const partRecord = part as Record<string, unknown>;
          const type = partRecord.type;
          if (typeof type !== "string" || !type.startsWith("tool-")) {
            continue;
          }

          const toolName = type.slice("tool-".length);
          const tool = (tools as Record<string, any> | undefined)?.[toolName];
          if (!tool) {
            throw new Error(`Unknown tool: ${toolName}`);
          }

          if ("input" in partRecord && tool.inputSchema?.parse) {
            tool.inputSchema.parse(partRecord.input);
          }

          if ("output" in partRecord && tool.outputSchema?.parse) {
            tool.outputSchema.parse(partRecord.output);
          }
        }
      }

      return messages;
    },
    generateId: () => `gen-${++counter}`,
    streamText: ({ system }: any) => {
      capturedSystem = typeof system === "string" ? system : String(system);
      if (streamTextShouldThrow) {
        throw new Error("streamText failed");
      }
      return {
        toUIMessageStreamResponse: async ({
          originalMessages,
          generateMessageId,
          onFinish,
        }: any) => {
          const assistantMessage: UIMessage = {
            id: generateMessageId(),
            role: "assistant",
            parts: [{ type: "text", text: "ok" }],
          };

          const finalMessages = [...originalMessages, assistantMessage];

          if (deleteThreadBeforeFinish) {
            (globalThis as GlobalWithDeleteThreadHelper).__deleteThreadTestHelper?.(
              deleteThreadBeforeFinish
            );
            deleteThreadBeforeFinish = null;
          }

          await onFinish?.({ messages: finalMessages });

          return new Response("ok", { status: 200 });
        },
      };
    },
  };
});

mock.module("@ai-sdk/openai", () => {
  return {
    createOpenAI: () => {
      const openai: any = (modelId: string) => ({ modelId, mode: "responses" });
      openai.chat = (modelId: string) => ({ modelId, mode: "chat" });
      return openai;
    },
  };
});

import { getDb } from "@/lib/db/client";
import { createThread, deleteThread as deleteThreadFromDb, getThread } from "@/lib/db/threads";
import { loadUIMessages } from "@/lib/db/messages";

(globalThis as GlobalWithDeleteThreadHelper).__deleteThreadTestHelper =
  deleteThreadFromDb;

function resetDatabase(): void {
  const db = getDb();
  db.exec("DELETE FROM messages;");
  db.exec("DELETE FROM threads;");
}

async function getChatPost() {
  const mod = await import("@/app/api/chat/route");
  return mod.POST;
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    deleteThreadBeforeFinish = null;
    capturedSystem = null;
    streamTextShouldThrow = false;
    resetDatabase();
  });

  it("returns 400 when id is missing", async () => {
    const POST = await getChatPost();

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: [] }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing thread id" });
  });

  it("returns 400 when messages are missing", async () => {
    const POST = await getChatPost();

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ id: "thread" }),
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing messages" });
  });

  it("persists messages and sets a truncated thread title", async () => {
    const realNow = Date.now;
    try {
      Date.now = () => 1000;
      const thread = createThread();

      Date.now = () => 2000;
      const POST = await getChatPost();

      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            id: thread.id,
            messages: [
              {
                id: "tmp",
                role: "assistant",
                parts: [],
              },
              {
                id: "u1",
                role: "user",
                parts: [
                  {
                    type: "text",
                    text: "This is a very long title that should be truncated nicely",
                  },
                ],
              },
            ],
          }),
        })
      );

      expect(response.status).toBe(200);

      const updated = getThread(thread.id);
      expect(updated?.title).toBe("This is a very long title that...");

      const persisted = loadUIMessages(thread.id);
      expect(persisted).toHaveLength(2);
      expect(persisted[0]?.id).toBe("u1");
      expect(persisted[1]?.role).toBe("assistant");
      expect((persisted[1]?.parts?.[0] as any)?.text).toBe("ok");
    } finally {
      Date.now = realNow;
    }
  });

  it("does not prefetch mentioned ranges into the system prompt", async () => {
    const thread = createThread();
    const POST = await getChatPost();

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          id: thread.id,
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [{ type: "text", text: "Show @Sheet1!A1:B2" }],
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(capturedSystem).toBeTruthy();
    expect(capturedSystem).not.toContain("Prefetched spreadsheet context");
  });

  it("does not set the thread title when streaming fails", async () => {
    const previousConsoleError = console.error;
    console.error = () => {};

    try {
      const thread = createThread();
      streamTextShouldThrow = true;

      const POST = await getChatPost();

      const response = await POST(
        new Request("http://localhost/api/chat", {
          method: "POST",
          body: JSON.stringify({
            id: thread.id,
            messages: [
              {
                id: "u1",
                role: "user",
                parts: [{ type: "text", text: "This should not set a title" }],
              },
            ],
          }),
        })
      );

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Failed to process chat" });
      expect(getThread(thread.id)?.title).toBe("");
      expect(loadUIMessages(thread.id)).toHaveLength(0);
    } finally {
      console.error = previousConsoleError;
    }
  });

  it("skips persistence when the thread was deleted", async () => {
    const thread = createThread();
    deleteThreadBeforeFinish = thread.id;

    const POST = await getChatPost();

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          id: thread.id,
          messages: [
            {
              id: "u1",
              role: "user",
              parts: [{ type: "text", text: "delete" }],
            },
          ],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(getThread(thread.id)).toBeNull();
    expect(loadUIMessages(thread.id)).toHaveLength(0);
  });
});

afterAll(() => {
  mock.restore();
});
