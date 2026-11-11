import { defineConfig } from "drizzle-kit";

// https://orm.drizzle.team/docs/drizzle-config-file
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/users/schema.ts",
  out: "./migrations",
});
