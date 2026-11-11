import { Hono } from "hono";
import { csrf } from "hono/csrf";

import { ErrorCode, GatewayError } from "@/lib/errors";

import { accessEmail } from "./access/access-identity.ts";
import type { AccountEnv } from "./account-env.ts";
import { githubRoutes } from "./github/github-routes.tsx";
import { homePage } from "./home/home-page.tsx";
import { meRoutes } from "./me/me-routes.ts";
import { pairingRoutes } from "./pairing/pairing-routes.tsx";

export const accountRoutes = new Hono<AccountEnv>()
  .use(async (c, next) => {
    const email = await accessEmail(
      { context: c.var.access, assertion: c.req.header("cf-access-jwt-assertion") },
      { audience: c.var.config.accessAud, teamDomain: c.var.config.accessTeamDomain },
    );
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
  .route("/github", githubRoutes)
  .route("/", pairingRoutes);
