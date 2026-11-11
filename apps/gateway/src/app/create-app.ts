import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

import { accountRoutes, type AccountVariables } from "@/account";
import { adminRoutes, type AdminVariables } from "@/admin";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";
import { HttpStatus } from "@/lib/http";

import { classifyHost } from "./hosts/classify-host.ts";

export type GatewayDeps = AdminVariables;

type DepsEnv = { Bindings: Env; Variables: GatewayDeps & { access: unknown } };

export function createApp(resolve: (env: Env) => GatewayDeps) {
  const provide = createMiddleware<DepsEnv>(async (c, next) => {
    const deps = resolve(c.env);
    c.set("config", deps.config);
    c.set("sandboxes", deps.sandboxes);
    c.set("users", deps.users);
    c.set("access", accessContext(c));
    await next();
  });

  const account = new Hono<{ Bindings: Env; Variables: AccountVariables }>()
    .use(provide)
    .route("/", accountRoutes)
    .notFound(notFound)
    .onError(onError);

  const gateway = new Hono<DepsEnv>()
    .use(provide)
    .route("/admin", adminRoutes)
    .notFound(notFound)
    .onError(onError);

  return new Hono<DepsEnv>()
    .use(provide)
    .use(async (c) => {
      const target = classifyHost(new URL(c.req.url).hostname, c.var.config.sandboxDomain);
      switch (target.kind) {
        case "sandbox": {
          const user = await c.var.users.bySandbox(target.name);
          if (!user) {
            throw new GatewayError(ErrorCode.NotFound);
          }
          return c.var.sandboxes.get(user.id).fetch(c.req.raw);
        }
        case "unknown-sandbox":
          throw new GatewayError(ErrorCode.NotFound);
        case "app":
          return account.fetch(c.req.raw, c.env, executionContext(c));
        case "gateway":
          return gateway.fetch(c.req.raw, c.env, executionContext(c));
      }
    })
    .notFound(notFound)
    .onError(onError);
}

function notFound(): Response {
  return errorResponse(new GatewayError(ErrorCode.NotFound));
}

function onError(error: Error): Response {
  return errorResponse(fromHono(error));
}

function executionContext(c: Context) {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

function accessContext(c: Context): unknown {
  const ctx = executionContext(c);
  return ctx && "access" in ctx ? ctx.access : undefined;
}

function fromHono(error: Error): unknown {
  if (error instanceof HTTPException) {
    if (error.status === HttpStatus.Unauthorized) {
      return new GatewayError(ErrorCode.Unauthorized, { cause: error });
    }
    if (error.status === HttpStatus.Forbidden) {
      return new GatewayError(ErrorCode.CrossSiteRequest, { cause: error });
    }
  }
  return error;
}
