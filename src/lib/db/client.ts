import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { initSchema } from "./schema";

const DEFAULT_DB_PATH = "data/app.sqlite";

type GlobalWithDb = typeof globalThis & {
  __appDb?: Database;
};

function resolveDbPath(): string {
  const envPath = process.env.DB_PATH?.trim();
  const dbPath = envPath && envPath.length > 0 ? envPath : DEFAULT_DB_PATH;
  if (dbPath === ":memory:") {
    return dbPath;
  }
  const resolved = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function getDb(): Database {
  const globalForDb = globalThis as GlobalWithDb;
  if (!globalForDb.__appDb) {
    const dbFile = resolveDbPath();
    const db = new Database(dbFile);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    initSchema(db);
    globalForDb.__appDb = db;
  }
  return globalForDb.__appDb;
}
