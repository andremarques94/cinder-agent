import { Hono } from "hono";

import { ErrorCode, GatewayError } from "@/lib/errors";
import { CACHE_CONTROL, HttpStatus, NO_STORE } from "@/lib/http";
import { callSandbox, pairingLink } from "@/sandbox";
import type { User } from "@/users";

import type { AdminContext, AdminEnv } from "../admin-env.ts";

export const sandboxesRoutes = new Hono<AdminEnv>()
  .post("/:name/pair", async (c) => {
    const user = await requireSandbox(c);
    const link = await pairingLink(
      c.var.sandboxes.get(user.id),
      user.sandbox,
      c.var.config.sandboxDomain,
      new URL(c.req.url),
    );
    c.header(CACHE_CONTROL, NO_STORE);
    return c.json(link);
  })

  .get("/:name", async (c) => {
    const user = await requireSandbox(c);
    return c.json(await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).status()));
  })

  .delete("/:name", async (c) => {
    const user = await requireSandbox(c);
    await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).stop());
    return c.body(null, HttpStatus.NoContent);
  });

async function requireSandbox(c: AdminContext): Promise<User> {
  const user = await c.var.users.bySandbox(c.req.param("name") ?? "");
  if (!user) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return user;
}
