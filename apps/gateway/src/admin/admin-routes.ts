import { Hono, type Context } from "hono";
import { bearerAuth } from "hono/bearer-auth";

import type { Config } from "@/config";
import { ErrorCode, GatewayError } from "@/errors";
import { HttpStatus } from "@/http";
import { sandboxOrigin } from "@/routing";
import type { SandboxDirectory, SandboxHandle } from "@/sandbox";

export interface AdminVariables {
  config: Config;
  sandboxes: SandboxDirectory;
}

type AdminEnv = { Variables: AdminVariables };
type AdminContext = Context<AdminEnv>;

export const adminRoutes = new Hono<AdminEnv>()
  .use(async (c, next) => {
    const token = c.var.config.adminToken;
    if (!token) {
      throw new GatewayError(ErrorCode.Unauthorized);
    }
    return bearerAuth<AdminEnv>({ token })(c, next);
  })

  .post("/sandboxes/:name/pair", async (c) => {
    const { name, sandbox } = requireSandbox(c);
    const pairing = await callSandbox(name, () => sandbox.pair());
    const server = sandboxOrigin(name, c.var.config.sandboxDomain, new URL(c.req.url));
    c.header("cache-control", "no-store");
    return c.json({
      url: new URL(`/auth/connect/${encodeURIComponent(pairing.code)}`, server).href,
      server,
      expiresIn: pairing.expiresIn,
    });
  })

  .get("/sandboxes/:name", async (c) => {
    const { name, sandbox } = requireSandbox(c);
    return c.json(await callSandbox(name, () => sandbox.status()));
  })

  .delete("/sandboxes/:name", async (c) => {
    const { name, sandbox } = requireSandbox(c);
    await callSandbox(name, () => sandbox.stop());
    return c.body(null, HttpStatus.NoContent);
  });

function requireSandbox(c: AdminContext): { name: string; sandbox: SandboxHandle } {
  const name = c.req.param("name");
  if (!name || !c.var.config.sandboxes.has(name)) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return { name, sandbox: c.var.sandboxes.get(name) };
}

function callSandbox<T>(name: string, call: () => Promise<T>): Promise<T> {
  return call().catch((cause: unknown) => {
    throw new GatewayError(ErrorCode.SandboxUnavailable, { cause, details: { sandbox: name } });
  });
}
