import { and, asc, eq, isNull, type SQL } from "drizzle-orm";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import { drizzle } from "drizzle-orm/d1";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import { ErrorCode, GatewayError } from "@/lib/errors";

import { githubAccounts, githubInstallations, sandboxNames, users } from "../schema.ts";

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
  deletingAt: number | null;
}

export interface Installation {
  installationId: number;
  accountLogin: string | null;
  createdAt: number;
}

interface UserInstallation extends Installation {
  userId: string;
}

export interface GithubAccount {
  githubUserId: number;
  login: string;
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
  markDeleting(id: string): Promise<void>;
  delete(id: string): Promise<User | null>;
  githubAccount(id: string): Promise<GithubAccount | null>;
  linkGithubAccount(id: string, account: GithubAccount): Promise<void>;
  installations(id: string): Promise<Installation[]>;
  allInstallations(): Promise<UserInstallation[]>;
  claimInstallation(
    id: string,
    installationId: number,
    accountLogin: string | null,
  ): Promise<boolean>;
  removeInstallation(id: string, installationId: number): Promise<boolean>;
  clearInstallations(id: string): Promise<void>;
}

const installationColumns = {
  installationId: githubInstallations.installationId,
  accountLogin: githubInstallations.accountLogin,
  createdAt: githubInstallations.createdAt,
};

const installationOrder = [
  asc(githubInstallations.createdAt),
  asc(githubInstallations.installationId),
];

// https://orm.drizzle.team/docs/connect-cloudflare-d1
export function d1UserStore(binding: D1Database, now: () => number = Date.now): UserStore {
  return userStore(drizzle(binding), now);
}

export function userStore(db: Database, now: () => number = Date.now): UserStore {
  const one = async (...where: SQL[]) =>
    (
      await db
        .select()
        .from(users)
        .where(and(...where))
        .limit(1)
        .all()
    )[0] ?? null;

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
      return { ...created, lastLoginAt: null, deletingAt: null };
    },

    list: () => db.select().from(users).orderBy(asc(users.createdAt)).all(),
    byId: (id) => one(eq(users.id, id)),
    byEmail: (email) => one(eq(users.email, email.toLowerCase()), isNull(users.deletingAt)),
    bySandbox: (sandbox) => one(eq(users.sandbox, sandbox), isNull(users.deletingAt)),

    async recordLogin(id) {
      await db.update(users).set({ lastLoginAt: now() }).where(eq(users.id, id));
    },

    async markDeleting(id) {
      await db
        .update(users)
        .set({ deletingAt: now() })
        .where(and(eq(users.id, id), isNull(users.deletingAt)));
    },

    async delete(id) {
      const user = await one(eq(users.id, id));
      if (user) {
        await db.delete(users).where(eq(users.id, id));
      }
      return user;
    },

    async githubAccount(id) {
      const rows = await db
        .select({ githubUserId: githubAccounts.githubUserId, login: githubAccounts.login })
        .from(githubAccounts)
        .where(eq(githubAccounts.userId, id))
        .limit(1)
        .all();
      return rows[0] ?? null;
    },

    async linkGithubAccount(id, account) {
      const row = { ...account, linkedAt: now() };
      await failOn(
        db
          .insert(githubAccounts)
          .values({ ...row, userId: id })
          .onConflictDoUpdate({ target: githubAccounts.userId, set: row }),
        { unique: ErrorCode.GithubAccountTaken, foreignKey: ErrorCode.NotFound },
      );
    },

    installations: (id) =>
      db
        .select(installationColumns)
        .from(githubInstallations)
        .where(eq(githubInstallations.userId, id))
        .orderBy(...installationOrder)
        .all(),

    allInstallations: () =>
      db
        .select({ ...installationColumns, userId: githubInstallations.userId })
        .from(githubInstallations)
        .orderBy(...installationOrder)
        .all(),

    async claimInstallation(id, installationId, accountLogin) {
      await failOn(
        db
          .insert(githubInstallations)
          .values({ installationId, userId: id, accountLogin, createdAt: now() })
          .onConflictDoUpdate({
            target: githubInstallations.installationId,
            set: { accountLogin },
            setWhere: eq(githubInstallations.userId, id),
          }),
        { foreignKey: ErrorCode.NotFound },
      );
      const owner = await db
        .select({ userId: githubInstallations.userId })
        .from(githubInstallations)
        .where(eq(githubInstallations.installationId, installationId))
        .limit(1)
        .all();
      return owner[0]?.userId === id;
    },

    async removeInstallation(id, installationId) {
      const removed = await db
        .delete(githubInstallations)
        .where(
          and(
            eq(githubInstallations.userId, id),
            eq(githubInstallations.installationId, installationId),
          ),
        )
        .returning({ installationId: githubInstallations.installationId });
      return removed.length > 0;
    },

    async clearInstallations(id) {
      await db.delete(githubInstallations).where(eq(githubInstallations.userId, id));
    },
  };
}

const UNIQUE_FAILURES = ["UNIQUE constraint failed", "PRIMARY KEY constraint failed"];
const FOREIGN_KEY_FAILURE = "FOREIGN KEY constraint failed";

interface ConstraintCodes {
  unique?: ErrorCode;
  foreignKey?: ErrorCode;
}

async function failOn<T>(query: Promise<T>, codes: ConstraintCodes): Promise<T> {
  try {
    return await query;
  } catch (cause) {
    const code = constraintCode(messages(cause).join("\n"), codes);
    if (code) {
      throw new GatewayError(code, { cause });
    }
    throw cause;
  }
}

function constraintCode(text: string, codes: ConstraintCodes): ErrorCode | undefined {
  if (UNIQUE_FAILURES.some((failure) => text.includes(failure))) {
    return codes.unique;
  }
  if (text.includes(FOREIGN_KEY_FAILURE)) {
    return codes.foreignKey;
  }
  return undefined;
}

function messages(error: unknown): string[] {
  return error instanceof Error ? [error.message, ...messages(error.cause)] : [];
}
