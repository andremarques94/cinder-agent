import { Hono } from "hono";

import { describeError, log } from "@/lib/log";
import { sandboxOrigin, type ServerStatus } from "@/sandbox";
import type { GithubAccount, Installation, User } from "@/users";

import type { AccountEnv } from "../account-env.ts";
import { Layout } from "../layout.tsx";

interface HomeProps {
  user: User;
  server: string;
  status: ServerStatus | null;
  githubApp: boolean;
  githubSignIn: boolean;
  githubAccount: GithubAccount | null;
  installations: Installation[];
}

export const homePage = new Hono<AccountEnv>().get("/", async (c) => {
  const { user, users, sandboxes, config } = c.var;
  const [status, githubAccount, installations] = await Promise.all([
    sandboxes
      .get(user.id)
      .status()
      .catch((error: unknown) => {
        log.warn("sandbox_status_failed", describeError(error));
        return null;
      }),
    users.githubAccount(user.id),
    users.installations(user.id),
  ]);
  return c.html(
    <Home
      user={user}
      server={sandboxOrigin(user.sandbox, config.sandboxDomain, new URL(c.req.url))}
      status={status}
      githubApp={config.github !== null}
      githubSignIn={config.githubSignIn !== null}
      githubAccount={githubAccount}
      installations={installations}
    />,
  );
});

function Home(props: HomeProps) {
  return (
    <Layout title="cinder-agent">
      <h1>cinder-agent</h1>
      <p class="muted">Signed in as {props.user.email}</p>
      <Devices server={props.server} />
      <Github {...props} />
      <Settings {...props} />
    </Layout>
  );
}

function Devices({ server }: { server: string }) {
  return (
    <section>
      <h2>Devices</h2>
      <p>
        Pair the OpenCode app on your phone or computer with your server, or open{" "}
        <a href={server}>{server}</a> in a browser.
      </p>
      <form method="post" action="/devices/pair">
        <button>Pair a device</button>
      </form>
    </section>
  );
}

function Github({ githubApp, githubSignIn, githubAccount, installations }: HomeProps) {
  return (
    <section>
      <h2>GitHub</h2>
      {githubAccount ? (
        <p>
          Linked to GitHub as <strong>{githubAccount.login}</strong>.
        </p>
      ) : (
        <p class="muted">Not linked to a GitHub account.</p>
      )}
      {installations.length > 0 ? (
        <>
          <p>Your sandbox can push to repositories on:</p>
          <ul>
            {installations.map((installation) => (
              <li>
                {installation.accountLogin ?? `Installation ${installation.installationId}`}
                <form
                  method="post"
                  action={`/github/installations/${installation.installationId}/delete`}
                >
                  <button>Unlink</button>
                </form>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p class="muted">No GitHub App installations are linked yet.</p>
      )}
      {githubSignIn ? (
        <div class="actions">
          <a class="button" href="/github/install">
            Install the GitHub App
          </a>
          <a class="button" href="/github/connect">
            Link installations you already have
          </a>
        </div>
      ) : (
        <p class="muted">
          {githubApp
            ? "Self-service install isn't set up on this gateway; ask the admin to link an installation."
            : "GitHub isn't set up on this gateway."}
        </p>
      )}
    </section>
  );
}

function Settings({ user, server, status }: HomeProps) {
  return (
    <section>
      <h2>Settings</h2>
      <dl>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Sandbox</dt>
        <dd>{user.sandbox}</dd>
        <dt>Server</dt>
        <dd>
          <a href={server}>{server}</a>
        </dd>
        <dt>Status</dt>
        <dd>{describeStatus(status)}</dd>
        <dt>OpenCode</dt>
        <dd>{status?.version ?? "—"}</dd>
        <dt>Last saved</dt>
        <dd>{status?.lastSavedAt ?? "never"}</dd>
      </dl>
    </section>
  );
}

function describeStatus(status: ServerStatus | null): string {
  if (!status) {
    return "unavailable";
  }
  if (status.ready) {
    return "running";
  }
  return status.running ? "starting" : "asleep (it wakes on the next request)";
}
