import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import { ErrorCode, GatewayError } from "@/lib/errors";

import type { AdminEnv } from "./admin-env.ts";
import { sandboxesRoutes } from "./sandboxes/sandboxes-routes.ts";
import { usersRoutes } from "./users/users-routes.ts";

export const adminRoutes = new Hono<AdminEnv>()
  .use(async (c, next) => {
    const token = c.var.config.adminToken;
    if (!token) {
      throw new GatewayError(ErrorCode.Unauthorized);
    }
    return bearerAuth<AdminEnv>({ token })(c, next);
  })
  .route("/users", usersRoutes)
  .route("/sandboxes", sandboxesRoutes);
