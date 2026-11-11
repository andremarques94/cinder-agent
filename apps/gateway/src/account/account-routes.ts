import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { html } from "hono/html";

import { accessEmail } from "@/access";
import type { Config } from "@/config";
import { ErrorCode, GatewayError } from "@/errors";
import { HttpStatus } from "@/http";
import { pairingLink } from "@/pairing";
import { sandboxOrigin } from "@/routing";
import type { SandboxDirectory } from "@/sandbox";
import type { User, UserStore } from "@/users";

export interface AccountVariables {
  config: Config;
  sandboxes: SandboxDirectory;
  users: UserStore;
  access: unknown;
  user: User;
}

type AccountEnv = { Variables: AccountVariables };

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

  .get("/", (c) => {
    const { email, sandbox } = c.var.user;
    const server = sandboxOrigin(sandbox, c.var.config.sandboxDomain, new URL(c.req.url));
    return c.html(
      html`<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>cinder-agent</title>
          </head>
          <body>
            <p>Signed in as ${email}. Your OpenCode server is <a href="${server}">${server}</a>.</p>
            <form method="post" action="/pair"><button>Pair a device</button></form>
          </body>
        </html>`,
    );
  })

  .get("/api/me", (c) => {
    const { email, sandbox } = c.var.user;
    const server = sandboxOrigin(sandbox, c.var.config.sandboxDomain, new URL(c.req.url));
    return c.json({ email, sandbox, server });
  })

  .post("/api/pair", async (c) => c.json(await pair(c.var, new URL(c.req.url))))

  .post("/pair", async (c) =>
    c.redirect((await pair(c.var, new URL(c.req.url))).url, HttpStatus.SeeOther),
  );

function pair({ user, sandboxes, config }: AccountVariables, requestUrl: URL) {
  return pairingLink(sandboxes.get(user.id), user.sandbox, config.sandboxDomain, requestUrl);
}
