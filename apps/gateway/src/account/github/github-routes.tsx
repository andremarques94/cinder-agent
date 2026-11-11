import { Hono, type Context } from "hono";
import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";
import { HttpStatus } from "@/lib/http";
import { log } from "@/lib/log";

import type { AccountEnv } from "../account-env.ts";
import { Layout } from "../layout.tsx";
import { githubSignIn, type GithubSignIn } from "./github-sign-in.ts";
import { linkGithub, type LinkResult, type LinkedInstallation } from "./link-github.ts";
import { newOauthState, rememberOauthState, takeOauthVerifier } from "./oauth-state.ts";

const CALLBACK_PATH = "/github/callback";

const InstallationIdSchema = v.pipe(v.string(), v.regex(/^[1-9][0-9]*$/), v.transform(Number));

type AccountContext = Context<AccountEnv>;

export const githubRoutes = new Hono<AccountEnv>()
  .get("/install", (c) => c.redirect(signIn(c).installUrl(), HttpStatus.SeeOther))
  .get("/setup", startOauth)
  .get("/connect", startOauth)

  .get("/callback", async (c) => {
    const github = signIn(c);
    const verifier = takeOauthVerifier(c, c.req.query("state"));
    const code = c.req.query("code");
    if (!code) {
      throw new GatewayError(ErrorCode.GithubSignInFailed, {
        details: { reason: c.req.query("error") ?? "no code" },
      });
    }
    const token = await github.exchangeCode({ code, verifier, redirectUri: callbackUrl(c) });
    const result = await linkGithub(github, c.var.users, c.var.user.id, token);
    log.info("github_linked", {
      userId: c.var.user.id,
      linked: result.linked.map((i) => i.installationId),
      notOwned: result.notOwned.map((i) => i.installationId),
      takenByOthers: result.takenByOthers.map((i) => i.installationId),
    });
    return c.html(<LinkedPage result={result} />);
  })

  .post("/installations/:id/delete", async (c) => {
    const id = v.safeParse(InstallationIdSchema, c.req.param("id"));
    if (!id.success || !(await c.var.users.removeInstallation(c.var.user.id, id.output))) {
      throw new GatewayError(ErrorCode.NotFound);
    }
    return c.redirect("/", HttpStatus.SeeOther);
  });

async function startOauth(c: AccountContext) {
  const github = signIn(c);
  const state = await newOauthState();
  rememberOauthState(c, state);
  return c.redirect(
    github.authorizeUrl({
      state: state.state,
      challenge: state.challenge,
      redirectUri: callbackUrl(c),
    }),
    HttpStatus.SeeOther,
  );
}

function signIn(c: AccountContext): GithubSignIn {
  const config = c.var.config.githubSignIn;
  if (!config) {
    throw new GatewayError(ErrorCode.GithubSignInNotConfigured);
  }
  return githubSignIn(config, c.var.fetch);
}

function callbackUrl(c: AccountContext): string {
  return new URL(CALLBACK_PATH, c.req.url).href;
}

function LinkedPage({ result }: { result: LinkResult }) {
  return (
    <Layout title="GitHub linked">
      <h1>GitHub linked</h1>
      <p>
        Signed in to GitHub as <strong>{result.login}</strong>.
      </p>
      <Installations title="Linked" installations={result.linked} />
      <Installations
        title="Skipped: you're not the account or an organization admin"
        installations={result.notOwned}
      />
      <Installations title="Skipped: linked to another user" installations={result.takenByOthers} />
      {result.linked.length === 0 &&
      result.notOwned.length === 0 &&
      result.takenByOthers.length === 0 ? (
        <p class="muted">No installations of the GitHub App were found for this account.</p>
      ) : null}
      <p>
        <a class="button" href="/">
          Back to the dashboard
        </a>
      </p>
    </Layout>
  );
}

function Installations({
  title,
  installations,
}: {
  title: string;
  installations: LinkedInstallation[];
}) {
  if (installations.length === 0) {
    return null;
  }
  return (
    <>
      <p>{title}:</p>
      <ul>
        {installations.map((installation) => (
          <li>{installation.login}</li>
        ))}
      </ul>
    </>
  );
}
