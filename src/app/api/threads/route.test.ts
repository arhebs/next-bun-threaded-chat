import { beforeEach, describe, expect, it } from "bun:test";

process.env.DB_PATH = ":memory:";

import { getDb } from "@/lib/db/client";
import { GET, POST } from "@/app/api/threads/route";

function resetDatabase(): void {
  const db = getDb();
  db.exec("DELETE FROM messages;");
  db.exec("DELETE FROM threads;");
}

describe("GET /api/threads", () => {
  beforeEach(() => {
    resetDatabase();
  });

  it("returns an empty list initially", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ threads: [] });
  });

  it("creates a thread via POST and lists it", async () => {
    const created = await POST(new Request("http://localhost/api/threads", { method: "POST" }));
    expect(created.status).toBe(201);

    const createdBody = await created.json();
    expect(createdBody).toHaveProperty("thread");
    expect(createdBody.thread).toHaveProperty("id");

    const listed = await GET();
    const listedBody = await listed.json();
    expect(Array.isArray(listedBody.threads)).toBe(true);
    expect(listedBody.threads).toHaveLength(1);
    expect(listedBody.threads[0].id).toBe(createdBody.thread.id);
  });
});
