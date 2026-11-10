import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { adminRoutes, type AdminVariables } from "@/admin";
import { ErrorCode, GatewayError, errorResponse } from "@/errors";
import { HttpStatus } from "@/http";
import { classifyHost } from "@/routing";

export type GatewayDeps = AdminVariables;

export function createApp(resolve: (env: Env) => GatewayDeps) {
  return new Hono<{ Bindings: Env; Variables: GatewayDeps }>()
    .use(async (c, next) => {
      const deps = resolve(c.env);
      c.set("config", deps.config);
      c.set("sandboxes", deps.sandboxes);
      await next();
    })

    .use(async (c, next) => {
      const target = classifyHost(new URL(c.req.url).hostname, c.var.config);
      switch (target.kind) {
        case "sandbox":
          return c.var.sandboxes.get(target.name).fetch(c.req.raw);
        case "unknown-sandbox":
          throw new GatewayError(ErrorCode.NotFound);
        case "gateway":
          return next();
      }
    })

    .route("/admin", adminRoutes)

    .notFound(() => errorResponse(new GatewayError(ErrorCode.NotFound)))
    .onError((error) => errorResponse(fromHono(error)));
}

function fromHono(error: Error): unknown {
  if (error instanceof HTTPException && error.status === HttpStatus.Unauthorized) {
    return new GatewayError(ErrorCode.Unauthorized, { cause: error });
  }
  return error;
}
