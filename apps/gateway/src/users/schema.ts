import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// https://orm.drizzle.team/docs/sql-schema-declaration
export const sandboxNames = sqliteTable("sandbox_names", {
  name: text("name").primaryKey(),
  claimedAt: integer("claimed_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  sandbox: text("sandbox")
    .notNull()
    .unique()
    .references(() => sandboxNames.name),
  createdAt: integer("created_at").notNull(),
  lastLoginAt: integer("last_login_at"),
});

export const githubInstallations = sqliteTable("github_installations", {
  installationId: integer("installation_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  accountLogin: text("account_login"),
  createdAt: integer("created_at").notNull(),
});
