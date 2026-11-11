import { DatabaseSync } from "node:sqlite";

import type { Database, Statement } from "@/users";

import users from "../../migrations/0001_users.sql?raw";

const MIGRATIONS = [users];

export function migratedDatabase(): Database {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of MIGRATIONS) {
    sqlite.exec(migration);
  }

  const statement = (query: string, values: (string | number | null)[] = []): Statement => {
    return {
      bind: (...next) => statement(query, next),
      first: async () => sqlite.prepare(query).get(...values) ?? null,
      all: async () => ({ results: sqlite.prepare(query).all(...values) }),
      run: async () => ({
        meta: { changes: Number(sqlite.prepare(query).run(...values).changes) },
      }),
    };
  };

  return {
    prepare: (query) => statement(query),
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const next of statements) {
          results.push(await next.run());
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
