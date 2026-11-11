import { DatabaseSync } from "node:sqlite";

import { drizzle } from "drizzle-orm/sqlite-proxy";

import type { Database } from "@/users";

import users from "../users/migrations/0000_users.sql?raw";

const MIGRATIONS = [users];

type Method = "run" | "all" | "values" | "get";

// https://orm.drizzle.team/docs/connect-drizzle-proxy
export function migratedDatabase(): Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of MIGRATIONS) {
    sqlite.exec(migration);
  }

  const query = (sql: string, params: unknown[], method: Method) => {
    const statement = sqlite.prepare(sql);
    const values = params.map(toSqlValue);
    if (method === "run") {
      statement.run(...values);
      return { rows: [] };
    }
    if (method === "get") {
      throw new Error(
        "use .limit(1).all() instead of .get(): the proxy can't return a missing row",
      );
    }
    return { rows: statement.all(...values).map((row) => Object.values(row)) };
  };

  return drizzle(
    async (sql, params, method) => query(sql, params, method),
    async (batch) => {
      sqlite.exec("BEGIN");
      try {
        const results = batch.map(({ sql, params, method }) => query(sql, params, method));
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  );
}

function toSqlValue(value: unknown): string | number | bigint | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value === null
  ) {
    return value;
  }
  throw new Error(`unsupported SQL parameter: ${typeof value}`);
}
