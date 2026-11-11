import { asc, eq, type SQL } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { ErrorCode, GatewayError } from "@/lib/errors";

import { githubInstallations, sandboxNames, users } from "../schema.ts";

export interface Database extends BaseSQLiteDatabase<"async", unknown> {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
    batch: T,
  ): Promise<BatchResponse<T>>;
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

const userColumns = {
  id: users.id,
  email: users.email,
  sandbox: users.sandbox,
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
  installationId: githubInstallations.installationId,
};

// https://orm.drizzle.team/docs/connect-cloudflare-d1
export function d1UserStore(binding: D1Database, now: () => number = Date.now): UserStore {
  return userStore(drizzle(binding), now);
}

export function userStore(db: Database, now: () => number = Date.now): UserStore {
  const select = () =>
    db
      .select(userColumns)
      .from(users)
      .leftJoin(githubInstallations, eq(githubInstallations.userId, users.id));

  const one = async (where: SQL) => (await select().where(where).limit(1).all())[0] ?? null;

  return {
    async create(user) {
      const email = user.email.toLowerCase();
      const created = { id: crypto.randomUUID(), email, sandbox: user.sandbox, createdAt: now() };
      await failOn(
        db.batch([
          db.insert(sandboxNames).values({ name: user.sandbox, claimedAt: created.createdAt }),
          db.insert(users).values(created),
        ]),
        { unique: ErrorCode.Conflict },
      );
      return { ...created, lastLoginAt: null, installationId: null };
    },

    list: () => select().orderBy(asc(users.createdAt)).all(),
    byId: (id) => one(eq(users.id, id)),
    byEmail: (email) => one(eq(users.email, email.toLowerCase())),
    bySandbox: (sandbox) => one(eq(users.sandbox, sandbox)),

    async recordLogin(id) {
      await db.update(users).set({ lastLoginAt: now() }).where(eq(users.id, id));
    },

    async setInstallation(id, installationId, accountLogin) {
      const row = { installationId, accountLogin, createdAt: now() };
      await failOn(
        db
          .insert(githubInstallations)
          .values({ ...row, userId: id })
          .onConflictDoUpdate({ target: githubInstallations.userId, set: row }),
        { unique: ErrorCode.Conflict, foreignKey: ErrorCode.NotFound },
      );
    },

    async clearInstallation(id) {
      await db.delete(githubInstallations).where(eq(githubInstallations.userId, id));
    },

    async delete(id) {
      const user = await one(eq(users.id, id));
      if (user) {
        await db.delete(users).where(eq(users.id, id));
      }
      return user;
    },
  };
}

const UNIQUE = /UNIQUE constraint failed|PRIMARY KEY constraint failed/;
const FOREIGN_KEY = /FOREIGN KEY constraint failed/;

function failOn<T>(
  query: Promise<T>,
  codes: { unique?: ErrorCode; foreignKey?: ErrorCode },
): Promise<T> {
  return query.catch((cause: unknown) => {
    const text = messages(cause).join("\n");
    const code = UNIQUE.test(text)
      ? codes.unique
      : FOREIGN_KEY.test(text)
        ? codes.foreignKey
        : null;
    if (code) {
      throw new GatewayError(code, { cause });
    }
    throw cause;
  });
}

function messages(error: unknown): string[] {
  return error instanceof Error ? [error.message, ...messages(error.cause)] : [];
}
