import { beforeEach, describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

process.env.DB_PATH = ":memory:";

import { getDb } from "@/lib/db/client";
import { createThread } from "@/lib/db/threads";
import { upsertMessages } from "@/lib/db/messages";
import { GET } from "@/app/api/threads/[id]/messages/route";

function resetDatabase(): void {
  const db = getDb();
  db.exec("DELETE FROM messages;");
  db.exec("DELETE FROM threads;");
}

describe("GET /api/threads/:id/messages", () => {
  beforeEach(() => {
    resetDatabase();
  });

  it("returns 400 when thread id is missing", async () => {
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "   " }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: "Missing thread id" });
  });

  it("returns an empty list when there are no messages", async () => {
    const thread = createThread();

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: thread.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ messages: [] });
  });

  it("returns persisted UI messages", async () => {
    const thread = createThread();

    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
    ];

    upsertMessages(thread.id, messages);

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: thread.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).toBe("u1");
    expect(body.messages[1].id).toBe("a1");
  });

  it("returns 500 when stored messages fail tool validation", async () => {
    const previousConsoleError = console.error;
    console.error = () => {};

    try {
      const thread = createThread();

      const messages: UIMessage[] = [
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-readRange",
              toolCallId: "call-1",
              state: "output-available",
              output: {
                sheet: "Sheet1",
                range: "A1",
                values: "not-a-2d-array",
              },
            } as any,
          ],
        } as any,
      ];

      upsertMessages(thread.id, messages);

      const response = await GET(new Request("http://localhost"), {
        params: Promise.resolve({ id: thread.id }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: "Failed to load messages" });
    } finally {
      console.error = previousConsoleError;
    }
  });
});
