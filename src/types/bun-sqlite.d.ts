declare module "bun:sqlite" {
  export type RunResult = {
    changes: number;
    lastInsertRowid: number | bigint;
  };

  export interface Statement<T = unknown> {
    all(...params: unknown[]): T[];
    get(...params: unknown[]): T | null;
    run(...params: unknown[]): RunResult;
  }

  export class Database {
    constructor(path?: string);
    exec(sql: string): void;
    query<T = unknown>(sql: string): Statement<T>;
  }
}
