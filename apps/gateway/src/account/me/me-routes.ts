import { Hono } from "hono";

import { sandboxOrigin } from "@/sandbox";

import type { AccountEnv } from "../account-env.ts";

export const meRoutes = new Hono<AccountEnv>().get("/", (c) => {
  const { email, sandbox } = c.var.user;
  const server = sandboxOrigin(sandbox, c.var.config.sandboxDomain, new URL(c.req.url));
  return c.json({ email, sandbox, server });
});
