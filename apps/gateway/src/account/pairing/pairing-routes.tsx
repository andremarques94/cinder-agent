import { Hono } from "hono";
import { raw } from "hono/html";
import { renderSVG } from "uqr";

import { pairingLink } from "@/sandbox";

import type { AccountEnv, AccountVariables } from "../account-env.ts";
import { Layout, githubAvatar } from "../layout.tsx";

const SECONDS_PER_MINUTE = 60;

const PAIR_SCRIPT = `
const pair = document.querySelector("[data-expires-in]");
const link = pair.querySelector("input");
const copy = pair.querySelector("[data-copy]");
const timer = document.querySelector("[data-timer]");
const end = Date.now() + Number(pair.dataset.expiresIn) * 1000;

copy.addEventListener("click", async () => {
  link.select();
  try {
    await navigator.clipboard.writeText(link.value);
  } catch {
    document.execCommand("copy");
  }
  copy.textContent = "Copied";
});

const tick = () => {
  const left = Math.max(0, Math.round((end - Date.now()) / 1000));
  if (left === 0) {
    pair.hidden = true;
    timer.textContent = "This code expired. Get a new one.";
    clearInterval(interval);
    return;
  }
  const seconds = String(left % 60).padStart(2, "0");
  timer.textContent = "Expires in " + Math.floor(left / 60) + ":" + seconds + ". Works once.";
};
const interval = setInterval(tick, 1000);
tick();
`;

export const pairingRoutes = new Hono<AccountEnv>()
  .post("/api/pair", async (c) => c.json(await pair(c.var, new URL(c.req.url))))

  .post("/devices/pair", async (c) => {
    const [link, githubAccount] = await Promise.all([
      pair(c.var, new URL(c.req.url)),
      c.var.users.githubAccount(c.var.user.id),
    ]);
    return c.html(
      <PairPage
        email={c.var.user.email}
        avatar={githubAccount ? githubAvatar(githubAccount.login) : null}
        url={link.url}
        expiresIn={link.expiresIn}
      />,
    );
  });

function pair({ user, sandboxes, config }: AccountVariables, requestUrl: URL) {
  return pairingLink(sandboxes.get(user.id), user.sandbox, config.sandboxDomain, requestUrl);
}

interface PairPageProps {
  email: string;
  avatar: string | null;
  url: string;
  expiresIn: number;
}

// https://opencode.ai/docs/cli/web
function PairPage({ email, avatar, url, expiresIn }: PairPageProps) {
  const minutes = Math.floor(expiresIn / SECONDS_PER_MINUTE);
  const seconds = String(expiresIn % SECONDS_PER_MINUTE).padStart(2, "0");
  return (
    <Layout title="Pair a device" viewer={{ email, avatar }} page="devices">
      <h2 class="title">Pair a device</h2>
      <p class="lede">Connect the OpenCode app on your phone or computer to your sandbox.</p>
      <div class="pair" data-expires-in={expiresIn}>
        <div class="qr">{raw(renderSVG(url, { border: 1 }))}</div>
        <div class="instructions">
          <ol class="steps">
            <li>Open the OpenCode app.</li>
            <li>Scan this code, or copy the link and paste it as the server address.</li>
          </ol>
          <div class="copy">
            <input class="field" readonly value={url} aria-label="Pairing link" />
            <button class="button primary" type="button" data-copy>
              Copy link
            </button>
          </div>
        </div>
      </div>
      <p class="hint group-note" data-timer>
        Expires in {minutes}:{seconds}. Works once.
      </p>
      <div class="actions group">
        <form method="post" action="/devices/pair">
          <button class="button">New code</button>
        </form>
        <a class="button" href={url}>
          Open in this browser
        </a>
        <a class="button quiet" href="/">
          Done
        </a>
      </div>
      <script type="module" dangerouslySetInnerHTML={{ __html: PAIR_SCRIPT }} />
    </Layout>
  );
}
