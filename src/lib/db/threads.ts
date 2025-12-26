import { randomUUID } from "node:crypto";

import { getDb } from "./client";
import type { Thread, ThreadRow } from "./types";

const THREAD_COLUMNS = "id, title, created_at, updated_at";

function mapThreadRow(row: ThreadRow): Thread {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createThread(): Thread {
  const db = getDb();
  const id = randomUUID();
  const now = Date.now();
  const title = "";

  db.query(
    "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
  ).run(id, title, now, now);

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export function listThreads(): Thread[] {
  const db = getDb();
  const rows = db
    .query<ThreadRow>(
      `SELECT ${THREAD_COLUMNS} FROM threads ORDER BY updated_at DESC`
    )
    .all();

  return rows.map(mapThreadRow);
}

export function getThread(threadId: string): Thread | null {
  const db = getDb();
  const row = db
    .query<ThreadRow>(`SELECT ${THREAD_COLUMNS} FROM threads WHERE id = ?`)
    .get(threadId);

  return row ? mapThreadRow(row) : null;
}

export function setThreadTitleIfEmpty(threadId: string, title: string): boolean {
  const db = getDb();
  const now = Date.now();
  const result = db
    .query("UPDATE threads SET title = ?, updated_at = ? WHERE id = ? AND title = ''")
    .run(title, now, threadId);

  return result.changes > 0;
}

export function touchThread(threadId: string): void {
  const db = getDb();
  const now = Date.now();
  db.query("UPDATE threads SET updated_at = ? WHERE id = ?").run(now, threadId);
}

export function deleteThread(threadId: string): boolean {
  const db = getDb();
  const result = db.query("DELETE FROM threads WHERE id = ?").run(threadId);
  return result.changes > 0;
}
