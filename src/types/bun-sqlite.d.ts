declare module "bun:sqlite" {
  export class Database {
    constructor(path?: string);
    exec(sql: string): void;
  }
}
