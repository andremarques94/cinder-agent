import { Hono, type Context } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import * as v from "valibot";

import type { Config } from "@/config";
import { ErrorCode, GatewayError } from "@/errors";
import { HttpStatus } from "@/http";
import { callSandbox, pairingLink } from "@/pairing";
import type { SandboxDirectory } from "@/sandbox";
import { SandboxNameSchema, type User, type UserStore } from "@/users";

export interface AdminVariables {
  config: Config;
  sandboxes: SandboxDirectory;
  users: UserStore;
}

type AdminEnv = { Variables: AdminVariables };
type AdminContext = Context<AdminEnv>;

const NewUserSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email(), v.toLowerCase()),
  sandbox: SandboxNameSchema,
});

const InstallationSchema = v.object({
  installationId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  accountLogin: v.optional(v.nullable(v.pipe(v.string(), v.nonEmpty())), null),
});

export const adminRoutes = new Hono<AdminEnv>()
  .use(async (c, next) => {
    const token = c.var.config.adminToken;
    if (!token) {
      throw new GatewayError(ErrorCode.Unauthorized);
    }
    return bearerAuth<AdminEnv>({ token })(c, next);
  })

  .get("/users", async (c) => c.json(await c.var.users.list()))

  .post("/users", async (c) => {
    const user = await c.var.users.create(await body(c, NewUserSchema));
    return c.json(user, HttpStatus.Created);
  })

  .delete("/users/:id", async (c) => {
    const user = await requireUser(c);
    await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).destroy());
    await c.var.users.delete(user.id);
    return c.body(null, HttpStatus.NoContent);
  })

  .put("/users/:id/github", async (c) => {
    const user = await requireUser(c);
    const { installationId, accountLogin } = await body(c, InstallationSchema);
    await c.var.users.setInstallation(user.id, installationId, accountLogin);
    return c.body(null, HttpStatus.NoContent);
  })

  .delete("/users/:id/github", async (c) => {
    const user = await requireUser(c);
    await c.var.users.clearInstallation(user.id);
    return c.body(null, HttpStatus.NoContent);
  })

  .post("/sandboxes/:name/pair", async (c) => {
    const user = await requireSandbox(c);
    const link = await pairingLink(
      c.var.sandboxes.get(user.id),
      user.sandbox,
      c.var.config.sandboxDomain,
      new URL(c.req.url),
    );
    c.header("cache-control", "no-store");
    return c.json(link);
  })

  .get("/sandboxes/:name", async (c) => {
    const user = await requireSandbox(c);
    return c.json(await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).status()));
  })

  .delete("/sandboxes/:name", async (c) => {
    const user = await requireSandbox(c);
    await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).stop());
    return c.body(null, HttpStatus.NoContent);
  });

async function requireUser(c: AdminContext): Promise<User> {
  const user = await c.var.users.byId(c.req.param("id") ?? "");
  if (!user) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return user;
}

async function requireSandbox(c: AdminContext): Promise<User> {
  const user = await c.var.users.bySandbox(c.req.param("name") ?? "");
  if (!user) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return user;
}

async function body<TSchema extends v.GenericSchema>(
  c: AdminContext,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  const json: unknown = await c.req.json().catch(() => undefined);
  const parsed = v.safeParse(schema, json);
  if (!parsed.success) {
    throw new GatewayError(ErrorCode.InvalidRequest, {
      details: { issues: v.summarize(parsed.issues) },
    });
  }
  return parsed.output;
}
