import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/errors";

type SqlValue = string | number | null;

export interface Statement {
  bind(...values: SqlValue[]): Statement;
  first(): Promise<Record<string, unknown> | null>;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface Database {
  prepare(query: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}

export interface User {
  id: string;
  email: string;
  sandbox: string;
  createdAt: number;
  lastLoginAt: number | null;
  installationId: number | null;
}

interface NewUser {
  email: string;
  sandbox: string;
}

export interface UserStore {
  create(user: NewUser): Promise<User>;
  list(): Promise<User[]>;
  byId(id: string): Promise<User | null>;
  byEmail(email: string): Promise<User | null>;
  bySandbox(sandbox: string): Promise<User | null>;
  recordLogin(id: string): Promise<void>;
  setInstallation(id: string, installationId: number, accountLogin: string | null): Promise<void>;
  clearInstallation(id: string): Promise<void>;
  delete(id: string): Promise<User | null>;
}

const UserRow = v.pipe(
  v.object({
    id: v.string(),
    email: v.string(),
    sandbox: v.string(),
    created_at: v.number(),
    last_login_at: v.nullable(v.number()),
    installation_id: v.nullable(v.number()),
  }),
  v.transform((row): User => ({
    id: row.id,
    email: row.email,
    sandbox: row.sandbox,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    installationId: row.installation_id,
  })),
);

const SELECT_USER = `
  SELECT u.id, u.email, u.sandbox, u.created_at, u.last_login_at, g.installation_id
  FROM users u LEFT JOIN github_installations g ON g.user_id = u.id`;

// https://developers.cloudflare.com/d1/worker-api/d1-database/
export function d1UserStore(db: Database, now: () => number = Date.now): UserStore {
  const one = async (where: string, value: string) => {
    const row = await db.prepare(`${SELECT_USER} WHERE ${where} = ?`).bind(value).first();
    return row ? v.parse(UserRow, row) : null;
  };

  return {
    async create({ email, sandbox }) {
      const id = crypto.randomUUID();
      const createdAt = now();
      const { meta } = await conflictOnUnique(
        db
          .prepare(
            `INSERT INTO users (id, email, sandbox, created_at)
             SELECT ?, ?, ?, ?
             WHERE NOT EXISTS (SELECT 1 FROM retired_sandbox_names WHERE name = ?)`,
          )
          .bind(id, email, sandbox, createdAt, sandbox)
          .run(),
      );
      if (meta.changes === 0) {
        throw new GatewayError(ErrorCode.Conflict, { details: { sandbox, reason: "retired" } });
      }
      return { id, email, sandbox, createdAt, lastLoginAt: null, installationId: null };
    },

    async list() {
      const { results } = await db.prepare(`${SELECT_USER} ORDER BY u.created_at`).all();
      return results.map((row) => v.parse(UserRow, row));
    },

    byId: (id) => one("u.id", id),
    byEmail: (email) => one("u.email", email),
    bySandbox: (sandbox) => one("u.sandbox", sandbox),

    async recordLogin(id) {
      await db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now(), id).run();
    },

    async setInstallation(id, installationId, accountLogin) {
      const [, inserted] = await conflictOnUnique(
        db.batch([
          db.prepare("DELETE FROM github_installations WHERE user_id = ?").bind(id),
          db
            .prepare(
              `INSERT INTO github_installations (installation_id, user_id, account_login, created_at)
               SELECT ?, id, ?, ? FROM users WHERE id = ?`,
            )
            .bind(installationId, accountLogin, now(), id),
        ]),
      );
      if (inserted?.meta.changes === 0) {
        throw new GatewayError(ErrorCode.NotFound);
      }
    },

    async clearInstallation(id) {
      await db.prepare("DELETE FROM github_installations WHERE user_id = ?").bind(id).run();
    },

    async delete(id) {
      const user = await one("u.id", id);
      if (!user) {
        return null;
      }
      await db.batch([
        db
          .prepare("INSERT OR IGNORE INTO retired_sandbox_names (name, retired_at) VALUES (?, ?)")
          .bind(user.sandbox, now()),
        db.prepare("DELETE FROM users WHERE id = ?").bind(id),
      ]);
      return user;
    },
  };
}

function conflictOnUnique<T>(query: Promise<T>): Promise<T> {
  return query.catch((cause: unknown) => {
    if (cause instanceof Error && /UNIQUE constraint failed/.test(cause.message)) {
      throw new GatewayError(ErrorCode.Conflict, { cause });
    }
    throw cause;
  });
}
