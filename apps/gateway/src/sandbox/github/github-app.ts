import { createAppAuth } from "@octokit/auth-app";
import * as v from "valibot";

import type { GithubConfig } from "@/lib/config";
import { ErrorCode, GatewayError } from "@/lib/errors";

const API_URL = "https://api.github.com";

const AppSchema = v.object({ slug: v.pipe(v.string(), v.nonEmpty()) });
const UserSchema = v.object({ id: v.pipe(v.number(), v.integer()) });

export interface GitIdentity {
  name: string;
  email: string;
}

export interface GithubApp {
  installationToken(installationId: number): Promise<string>;
  botIdentity(installationId: number): Promise<GitIdentity>;
}

const apps = new Map<number, GithubApp>();

export function githubApp(config: GithubConfig): GithubApp {
  let app = apps.get(config.appId);
  if (!app) {
    app = createGithubApp(config);
    apps.set(config.appId, app);
  }
  return app;
}

function createGithubApp({ appId, privateKey }: GithubConfig): GithubApp {
  const auth = createAppAuth({ appId, privateKey });
  let identity: Promise<GitIdentity> | null = null;

  const installationToken = async (installationId: number) => {
    try {
      return (await auth({ type: "installation", installationId })).token;
    } catch (cause) {
      throw new GatewayError(ErrorCode.GithubUnavailable, { cause, details: { installationId } });
    }
  };

  const loadIdentity = async (installationId: number): Promise<GitIdentity> => {
    const { slug } = v.parse(AppSchema, await getJson("/app", (await auth({ type: "app" })).token));
    const login = `${slug}[bot]`;
    const { id } = v.parse(
      UserSchema,
      await getJson(`/users/${encodeURIComponent(login)}`, await installationToken(installationId)),
    );
    return { name: login, email: `${id}+${login}@users.noreply.github.com` };
  };

  return {
    installationToken,
    botIdentity(installationId) {
      identity ??= loadIdentity(installationId).catch((cause: unknown) => {
        identity = null;
        throw cause instanceof GatewayError
          ? cause
          : new GatewayError(ErrorCode.GithubUnavailable, { cause });
      });
      return identity;
    },
  };
}

// https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
async function getJson(path: string, token: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "cinder-agent",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}`);
  }
  return response.json();
}
