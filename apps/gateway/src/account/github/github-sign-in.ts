import * as v from "valibot";

import type { GithubSignInConfig } from "@/lib/config";
import { ErrorCode, GatewayError } from "@/lib/errors";
import { HttpStatus } from "@/lib/http";

const GITHUB = "https://github.com";
const API = "https://api.github.com";
const PAGE_SIZE = 100;
const MAX_PAGES = 10;

const Id = v.pipe(v.number(), v.integer(), v.minValue(1));

const TokenSchema = v.object({ access_token: v.pipe(v.string(), v.nonEmpty()) });

const UserSchema = v.object({ id: Id, login: v.pipe(v.string(), v.nonEmpty()) });

const AccountSchema = v.object({
  id: Id,
  login: v.pipe(v.string(), v.nonEmpty()),
  type: v.string(),
});

const InstallationsSchema = v.object({
  total_count: v.number(),
  installations: v.array(
    v.object({ id: Id, account: v.fallback(v.nullable(AccountSchema), null) }),
  ),
});

const MembershipSchema = v.object({ state: v.string(), role: v.string() });

export interface GithubUser {
  id: number;
  login: string;
}

export interface GithubInstallation {
  id: number;
  account: { id: number; login: string; type: string } | null;
}

export interface GithubSignIn {
  installUrl(): string;
  authorizeUrl(options: { state: string; challenge: string; redirectUri: string }): string;
  exchangeCode(options: { code: string; verifier: string; redirectUri: string }): Promise<string>;
  user(token: string): Promise<GithubUser>;
  installations(token: string): Promise<GithubInstallation[]>;
  isOrgAdmin(token: string, org: string): Promise<boolean>;
}

// https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
// https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token
// https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-the-authenticated-user
export function githubSignIn(config: GithubSignInConfig, fetcher: typeof fetch): GithubSignIn {
  const api = async (path: string, token: string): Promise<Response> =>
    fetcher(`${API}${path}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "cinder-agent",
        "x-github-api-version": "2022-11-28",
      },
    });

  const apiJson = async <T extends v.GenericSchema>(path: string, token: string, schema: T) => {
    const response = await api(path, token);
    if (!response.ok) {
      throw failed(`GET ${path} returned ${response.status}`);
    }
    return parse(schema, await response.json());
  };

  return {
    installUrl: () => `${GITHUB}/apps/${encodeURIComponent(config.slug)}/installations/new`,

    authorizeUrl({ state, challenge, redirectUri }) {
      const url = new URL(`${GITHUB}/login/oauth/authorize`);
      url.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return url.href;
    },

    async exchangeCode({ code, verifier, redirectUri }) {
      const response = await fetcher(`${GITHUB}/login/oauth/access_token`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier,
        }),
      });
      if (!response.ok) {
        throw failed(`token exchange returned ${response.status}`);
      }
      return parse(TokenSchema, await response.json()).access_token;
    },

    user: (token) => apiJson("/user", token, UserSchema),

    async installations(token) {
      const all: GithubInstallation[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const { total_count, installations } = await apiJson(
          `/user/installations?per_page=${PAGE_SIZE}&page=${page}`,
          token,
          InstallationsSchema,
        );
        all.push(...installations);
        if (installations.length < PAGE_SIZE || all.length >= total_count) {
          break;
        }
      }
      return all;
    },

    async isOrgAdmin(token, org) {
      const path = `/user/memberships/orgs/${encodeURIComponent(org)}`;
      const response = await api(path, token);
      if (response.status === HttpStatus.Forbidden || response.status === HttpStatus.NotFound) {
        return false;
      }
      if (!response.ok) {
        throw failed(`GET ${path} returned ${response.status}`);
      }
      const membership = parse(MembershipSchema, await response.json());
      return membership.state === "active" && membership.role === "admin";
    },
  };
}

function parse<T extends v.GenericSchema>(schema: T, value: unknown): v.InferOutput<T> {
  const parsed = v.safeParse(schema, value);
  if (!parsed.success) {
    throw failed(`unexpected response: ${v.summarize(parsed.issues)}`);
  }
  return parsed.output;
}

function failed(reason: string): GatewayError {
  return new GatewayError(ErrorCode.GithubSignInFailed, { details: { reason } });
}
