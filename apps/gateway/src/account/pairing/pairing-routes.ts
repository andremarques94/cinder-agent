import { Hono } from "hono";

import { HttpStatus } from "@/lib/http";
import { pairingLink } from "@/sandbox";

import type { AccountEnv, AccountVariables } from "../account-env.ts";

export const pairingRoutes = new Hono<AccountEnv>()
  .post("/api/pair", async (c) => c.json(await pair(c.var, new URL(c.req.url))))

  .post("/pair", async (c) =>
    c.redirect((await pair(c.var, new URL(c.req.url))).url, HttpStatus.SeeOther),
  );

function pair({ user, sandboxes, config }: AccountVariables, requestUrl: URL) {
  return pairingLink(sandboxes.get(user.id), user.sandbox, config.sandboxDomain, requestUrl);
}
