import { mkdirSync } from "node:fs";
import path from "node:path";

import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import * as schema from "./tables";

const DEFAULT_DB_PATH = "data/app.sqlite";

type DrizzleDb = BunSQLiteDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & {
  __appDb?: Database;
  __drizzleDb?: DrizzleDb;
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

    const drizzleDb = drizzle(db, { schema });
    migrate(drizzleDb, { migrationsFolder: "drizzle" });

    globalForDb.__appDb = db;
    globalForDb.__drizzleDb = drizzleDb;
  }
  return globalForDb.__appDb;
}

export function getDrizzleDb(): DrizzleDb {
  const globalForDb = globalThis as GlobalWithDb;
  if (!globalForDb.__drizzleDb) {
    globalForDb.__drizzleDb = drizzle(getDb(), { schema });
  }
  return globalForDb.__drizzleDb;
}
