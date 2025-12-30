import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { getDrizzleDb } from "./client";
import { threads, type ThreadRow } from "./tables";

export type Thread = ThreadRow;

export function createThread(): Thread {
  const db = getDrizzleDb();
  const id = randomUUID();
  const now = Date.now();
  const title = "";

  db.insert(threads)
    .values({
      id,
      title,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export function listThreads(): Thread[] {
  const db = getDrizzleDb();
  return db.select().from(threads).orderBy(desc(threads.updatedAt)).all();
}

export function getThread(threadId: string): Thread | null {
  const db = getDrizzleDb();
  const trimmed = threadId.trim();
  if (!trimmed) {
    return null;
  }

  return db.select().from(threads).where(eq(threads.id, trimmed)).get() ?? null;
}

export function setThreadTitleIfEmpty(threadId: string, title: string): boolean {
  const db = getDrizzleDb();
  const now = Date.now();
  const updated = db
    .update(threads)
    .set({ title, updatedAt: now })
    .where(and(eq(threads.id, threadId), eq(threads.title, "")))
    .returning({ id: threads.id })
    .all();

  return updated.length > 0;
}

export function touchThread(threadId: string): void {
  const db = getDrizzleDb();
  const now = Date.now();
  db.update(threads).set({ updatedAt: now }).where(eq(threads.id, threadId)).run();
}

export function deleteThread(threadId: string): boolean {
  const db = getDrizzleDb();
  const deleted = db
    .delete(threads)
    .where(eq(threads.id, threadId))
    .returning({ id: threads.id })
    .all();

  return deleted.length > 0;
}
