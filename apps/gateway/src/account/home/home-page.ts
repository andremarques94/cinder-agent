import { Hono } from "hono";
import { html } from "hono/html";

import { sandboxOrigin } from "@/sandbox";

import type { AccountEnv } from "../account-env.ts";

export const homePage = new Hono<AccountEnv>().get("/", (c) => {
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
});
