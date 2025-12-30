import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

process.env.DB_PATH = ":memory:";

import { getDb } from "@/lib/db/client";
import {
  createThread,
  deleteThread,
  getThread,
  listThreads,
  setThreadTitleIfEmpty,
  touchThread,
} from "@/lib/db/threads";
import { loadUIMessages, upsertMessages } from "@/lib/db/messages";

function resetDatabase(): void {
  const db = getDb();
  db.exec("DELETE FROM consumed_confirmations;");
  db.exec("DELETE FROM messages;");
  db.exec("DELETE FROM threads;");
}

describe("db", () => {
  const realNow = Date.now;

  beforeEach(() => {
    resetDatabase();
  });

  afterEach(() => {
    Date.now = realNow;
  });

  it("creates and lists threads ordered by updated_at", () => {
    Date.now = () => 1000;
    const first = createThread();

    Date.now = () => 2000;
    const second = createThread();

    const threads = listThreads();
    expect(threads.map((thread) => thread.id)).toEqual([second.id, first.id]);
  });

  it("sets title only when empty", () => {
    Date.now = () => 1000;
    const thread = createThread();

    Date.now = () => 2000;
    const didSet = setThreadTitleIfEmpty(thread.id, "Hello");
    expect(didSet).toBe(true);

    const updated = getThread(thread.id);
    expect(updated?.title).toBe("Hello");

    Date.now = () => 3000;
    const didSetAgain = setThreadTitleIfEmpty(thread.id, "Ignored");
    expect(didSetAgain).toBe(false);

    const unchanged = getThread(thread.id);
    expect(unchanged?.title).toBe("Hello");
  });

  it("touchThread updates updated_at", () => {
    Date.now = () => 1000;
    const thread = createThread();

    Date.now = () => 2000;
    touchThread(thread.id);

    const updated = getThread(thread.id);
    expect(updated?.updatedAt).toBe(2000);
  });

  it("deletes thread and cascades messages", () => {
    Date.now = () => 1000;
    const thread = createThread();

    const message: UIMessage = {
      id: "m1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
    };

    upsertMessages(thread.id, [message]);
    expect(loadUIMessages(thread.id)).toHaveLength(1);

    const deleted = deleteThread(thread.id);
    expect(deleted).toBe(true);
    expect(getThread(thread.id)).toBeNull();
    expect(loadUIMessages(thread.id)).toHaveLength(0);
  });

  it("upserts messages preserving createdAt for existing ids", () => {
    const thread = createThread();

    Date.now = () => 1000;
    upsertMessages(thread.id, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    ]);

    Date.now = () => 2000;
    upsertMessages(thread.id, [
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "updated" }],
      },
    ]);

    const [loaded] = loadUIMessages(thread.id);
    expect(loaded.parts).toEqual([{ type: "text", text: "updated" }]);
    expect((loaded.metadata as any)?.createdAt).toBe(1000);
  });

  it("rejects upserts when a message id belongs to a different thread", () => {
    const first = createThread();
    const second = createThread();

    Date.now = () => 1000;
    upsertMessages(first.id, [
      {
        id: "shared",
        role: "user",
        parts: [{ type: "text", text: "hi" }],
      },
    ]);

    expect(() =>
      upsertMessages(second.id, [
        {
          id: "shared",
          role: "user",
          parts: [{ type: "text", text: "collision" }],
        },
      ])
    ).toThrow("belongs to thread");
  });
});
