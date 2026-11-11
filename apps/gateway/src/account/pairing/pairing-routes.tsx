import { Hono } from "hono";
import { raw } from "hono/html";
import { renderSVG } from "uqr";

import { pairingLink } from "@/sandbox";

import type { AccountEnv, AccountVariables } from "../account-env.ts";
import { Layout } from "../layout.tsx";

export const pairingRoutes = new Hono<AccountEnv>()
  .post("/api/pair", async (c) => c.json(await pair(c.var, new URL(c.req.url))))

  .post("/devices/pair", async (c) => {
    const link = await pair(c.var, new URL(c.req.url));
    return c.html(<PairPage url={link.url} minutes={Math.round(link.expiresIn / 60)} />);
  });

function pair({ user, sandboxes, config }: AccountVariables, requestUrl: URL) {
  return pairingLink(sandboxes.get(user.id), user.sandbox, config.sandboxDomain, requestUrl);
}

// https://opencode.ai/docs/cli/web
function PairPage({ url, minutes }: { url: string; minutes: number }) {
  return (
    <Layout title="Pair a device">
      <h1>Pair a device</h1>
      <p>
        Scan this code with the OpenCode app, or paste the link into its server address field. It
        works once and expires in {minutes} minutes.
      </p>
      <div class="qr">{raw(renderSVG(url, { border: 1 }))}</div>
      <p>
        <code>{url}</code>
      </p>
      <div class="actions">
        <a class="button" href={url}>
          Open in this browser
        </a>
        <form method="post" action="/devices/pair">
          <button>New code</button>
        </form>
        <a class="button" href="/">
          Back
        </a>
      </div>
    </Layout>
  );
}
