import { Hono } from "hono";

import { APP_NAME } from "@/lib/config";
import { describeError, log } from "@/lib/log";
import { sandboxOrigin, type SandboxHandle, type ServerStatus } from "@/sandbox";
import type { GithubAccount, Installation, User } from "@/users";

import type { AccountEnv } from "../account-env.ts";
import { Layout, githubAvatar } from "../layout.tsx";
import { timeAgo } from "./time-ago.ts";

type SandboxState = "running" | "starting" | "asleep" | "unavailable";

const STATE: Record<SandboxState, { label: string; detail: string | null }> = {
  running: { label: "Running", detail: null },
  starting: { label: "Starting", detail: null },
  asleep: { label: "Asleep", detail: "wakes on connect" },
  unavailable: { label: "Unknown", detail: "can't reach it" },
};

interface HomeProps {
  user: User;
  server: string;
  status: ServerStatus | null;
  now: number;
  githubApp: boolean;
  githubSignIn: boolean;
  githubAccount: GithubAccount | null;
  installations: Installation[];
}

export const homePage = new Hono<AccountEnv>().get("/", async (c) => {
  const { user, users, sandboxes, config } = c.var;
  const [status, githubAccount, installations] = await Promise.all([
    statusOrNull(sandboxes.get(user.id)),
    users.githubAccount(user.id),
    users.installations(user.id),
  ]);
  return c.html(
    <Home
      user={user}
      server={sandboxOrigin(user.sandbox, config.sandboxDomain, new URL(c.req.url))}
      status={status}
      now={Date.now()}
      githubApp={config.github !== null}
      githubSignIn={config.githubSignIn !== null}
      githubAccount={githubAccount}
      installations={installations}
    />,
  );
});

function Home(props: HomeProps) {
  const { user, server, githubAccount, githubApp } = props;
  return (
    <Layout
      title={APP_NAME}
      viewer={{
        email: user.email,
        avatar: githubAccount ? githubAvatar(githubAccount.login) : null,
      }}
      page="overview"
      showGithub={githubApp}
      actions={<PairButton primary />}
    >
      <h2 class="title">{user.sandbox}</h2>
      <p class="lede">
        <a href={server}>{new URL(server).host}</a>
      </p>
      <Stats {...props} />
      <Devices server={server} />
      {githubApp ? <Github {...props} /> : null}
    </Layout>
  );
}

function PairButton({ primary = false }: { primary?: boolean }) {
  return (
    <form method="post" action="/devices/pair">
      <button class={primary ? "button primary" : "button"}>Pair a device</button>
    </form>
  );
}

function Stats({ status, now }: HomeProps) {
  const state = sandboxState(status);
  const { label, detail } = STATE[state];
  return (
    <dl class="stats">
      <div class="stat">
        <dt>Status</dt>
        <dd class={state === "running" ? "ok" : undefined}>
          {label}
          {detail ? <small>{detail}</small> : null}
        </dd>
      </div>
      <div class="stat">
        <dt>Last saved</dt>
        <dd>{status?.lastSavedAt ? timeAgo(status.lastSavedAt, now) : "Never"}</dd>
      </div>
      <div class="stat">
        <dt>OpenCode</dt>
        <dd>{status?.version ?? "—"}</dd>
      </div>
    </dl>
  );
}

function Devices({ server }: { server: string }) {
  return (
    <section id="devices" class="group">
      <div class="group-head">
        <h2>Devices</h2>
      </div>
      <div class="rows">
        <div class="row">
          <div class="grow">
            <strong>OpenCode app</strong>
            <span class="sub">Pair your phone or computer. Each code works once.</span>
          </div>
          <PairButton />
        </div>
        <div class="row">
          <div class="grow">
            <strong>Browser</strong>
            <span class="sub">Use OpenCode on the web, on this device.</span>
          </div>
          <a class="button" href={server}>
            Open
          </a>
        </div>
      </div>
    </section>
  );
}

function Github({ githubSignIn, githubAccount, installations }: HomeProps) {
  return (
    <section id="github" class="group">
      <div class="group-head">
        <h2>GitHub</h2>
        {githubSignIn ? (
          <div class="actions">
            <a class="button quiet" href="/github/connect">
              Link existing
            </a>
            <a class="button" href="/github/install">
              Install the GitHub App
            </a>
          </div>
        ) : null}
      </div>
      <ul class="rows">
        {installations.length === 0 ? (
          <li class="empty">
            Link GitHub so your sandbox can clone and push to your repositories.
          </li>
        ) : (
          installations.map((installation) => (
            <InstallationRow installation={installation} githubAccount={githubAccount} />
          ))
        )}
      </ul>
      {githubSignIn ? null : <p class="hint group-note">Ask the admin to link more accounts.</p>}
    </section>
  );
}

function InstallationRow({
  installation,
  githubAccount,
}: {
  installation: Installation;
  githubAccount: GithubAccount | null;
}) {
  const login = installation.accountLogin;
  return (
    <li class="row">
      {login ? <img class="avatar" src={githubAvatar(login)} alt="" /> : <span class="avatar" />}
      <div class="grow">
        <strong>{login ?? `Installation ${installation.installationId}`}</strong>
        <span class="sub">{accountKind(login, githubAccount)}</span>
      </div>
      <form method="post" action={`/github/installations/${installation.installationId}/delete`}>
        <button class="button quiet">Unlink</button>
      </form>
    </li>
  );
}

function accountKind(login: string | null, githubAccount: GithubAccount | null): string {
  if (!githubAccount || !login) {
    return "Linked by the admin";
  }
  if (login.toLowerCase() === githubAccount.login.toLowerCase()) {
    return "Your account";
  }
  return "Organization";
}

function sandboxState(status: ServerStatus | null): SandboxState {
  if (!status) {
    return "unavailable";
  }
  if (status.ready) {
    return "running";
  }
  if (status.running) {
    return "starting";
  }
  return "asleep";
}

async function statusOrNull(sandbox: SandboxHandle): Promise<ServerStatus | null> {
  try {
    return await sandbox.status();
  } catch (error) {
    log.warn("sandbox_status_failed", describeError(error));
    return null;
  }
}
