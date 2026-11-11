import { Hono } from "hono";
import { csrf } from "hono/csrf";

import { ErrorCode, GatewayError } from "@/lib/errors";

import { accessEmail } from "./access/access-identity.ts";
import type { AccountEnv } from "./account-env.ts";
import { homePage } from "./home/home-page.ts";
import { meRoutes } from "./me/me-routes.ts";
import { pairingRoutes } from "./pairing/pairing-routes.ts";

export const accountRoutes = new Hono<AccountEnv>()
  .use(async (c, next) => {
    const email = await accessEmail(c.var.access, c.var.config.accessAud);
    const user = await c.var.users.byEmail(email);
    if (!user) {
      throw new GatewayError(ErrorCode.NotInvited);
    }
    c.set("user", user);
    await c.var.users.recordLogin(user.id);
    c.header("cache-control", "no-store");
    await next();
  })
  .use(csrf())
  .route("/", homePage)
  .route("/api/me", meRoutes)
  .route("/", pairingRoutes);
