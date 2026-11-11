import { Hono, type Context } from "hono";
import * as v from "valibot";

import { IdSchema } from "@/lib/config";
import { ErrorCode, GatewayError } from "@/lib/errors";
import { HttpStatus } from "@/lib/http";
import { log } from "@/lib/log";

import type { AccountEnv } from "../account-env.ts";
import { Layout, githubAvatar } from "../layout.tsx";
import { githubSignIn, type GithubSignIn } from "./github-sign-in.ts";
import { linkGithub, type LinkResult } from "./link-github.ts";
import { newOauthState, rememberOauthState, takeOauthVerifier } from "./oauth-state.ts";

const CALLBACK_PATH = "/github/callback";

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
    return c.html(<LinkedPage result={result} email={c.var.user.email} />);
  })

  .post("/installations/:id/delete", async (c) => {
    const id = v.safeParse(IdSchema, c.req.param("id"));
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

const OUTCOME_TEXT = {
  linked: "Linked. Your sandbox can push here.",
  notOwned: "Skipped. Only the account owner or an organization admin can link it.",
  takenByOthers: "Skipped. Another user already linked it.",
} as const;

function LinkedPage({ result, email }: { result: LinkResult; email: string }) {
  const rows = [
    ...result.linked.map((installation) => ({ installation, text: OUTCOME_TEXT.linked })),
    ...result.notOwned.map((installation) => ({ installation, text: OUTCOME_TEXT.notOwned })),
    ...result.takenByOthers.map((installation) => ({
      installation,
      text: OUTCOME_TEXT.takenByOthers,
    })),
  ];
  return (
    <Layout title="GitHub" viewer={{ email, avatar: githubAvatar(result.login) }} page="github">
      <h2 class="title">Signed in to GitHub as {result.login}</h2>
      <p class="lede">Here's what happened to each account with the GitHub App installed.</p>
      <ul class="rows group">
        {rows.length === 0 ? (
          <li class="empty">
            None of your accounts or organizations has the GitHub App installed yet.
          </li>
        ) : (
          rows.map(({ installation, text }) => (
            <li class="row">
              <img class="avatar" src={githubAvatar(installation.login)} alt="" />
              <div class="grow">
                <strong>{installation.login}</strong>
                <span class="sub">{text}</span>
              </div>
            </li>
          ))
        )}
      </ul>
      <div class="actions group">
        <a class="button primary" href="/">
          Back to overview
        </a>
      </div>
    </Layout>
  );
}
