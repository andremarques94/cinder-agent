// https://nodejs.org/api/sqlite.html
declare module "node:sqlite" {
  type SqlValue = string | number | bigint | null;

  export class StatementSync {
    get(...values: SqlValue[]): Record<string, unknown> | undefined;
    all(...values: SqlValue[]): Record<string, unknown>[];
    run(...values: SqlValue[]): { changes: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }
}

// https://vite.dev/guide/assets#importing-asset-as-string
declare module "*?raw" {
  const content: string;
  export default content;
}
