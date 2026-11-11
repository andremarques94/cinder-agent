const GITHUB = "github.com";
const GITHUB_API = "api.github.com";
const HTTPS = "https:";

export const GITHUB_HOSTS = [GITHUB, GITHUB_API] as const;

export const TOKEN_PLACEHOLDER = "cinder-placeholder";

const GIT_SERVICES = new Set(["info/refs", "git-upload-pack", "git-receive-pack"]);

const API_REPOS = "repos";

type AuthScheme = "bearer" | "git";

export interface OwnedInstallation {
  installationId: number;
  accountLogin: string | null;
}

export type TokenFor = (owner: string | null) => Promise<string | null>;

export function repositoryOwner(url: URL): string | null {
  const segments = pathSegments(url);
  switch (url.hostname) {
    case GITHUB:
      return gitOwner(segments)?.toLowerCase() ?? null;
    case GITHUB_API:
      return apiOwner(segments)?.toLowerCase() ?? null;
    default:
      return null;
  }
}

export function pickInstallation(
  installations: readonly OwnedInstallation[],
  owner: string | null,
  ownLogin: string | null,
): number | null {
  const on = (login: string | null) => {
    if (login === null) {
      return undefined;
    }
    return installations.find((i) => i.accountLogin?.toLowerCase() === login.toLowerCase());
  };
  return (on(owner) ?? on(ownLogin) ?? installations[0])?.installationId ?? null;
}

// https://developers.cloudflare.com/sandbox/network/clone-a-private-repository/
export async function authorizeGithubRequest(
  request: Request,
  tokenFor: TokenFor,
): Promise<Request> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  const scheme = authScheme(url);
  const token = scheme ? await tokenFor(repositoryOwner(url)) : null;
  if (scheme && token) {
    headers.set("authorization", authorization(scheme, token));
  }
  return new Request(request, { headers });
}

function authScheme(url: URL): AuthScheme | null {
  if (url.protocol !== HTTPS) {
    return null;
  }
  switch (url.hostname) {
    case GITHUB_API:
      return "bearer";
    case GITHUB:
      return gitOwner(pathSegments(url)) ? "git" : null;
    default:
      return null;
  }
}

function authorization(scheme: AuthScheme, token: string): string {
  switch (scheme) {
    case "bearer":
      return `Bearer ${token}`;
    case "git":
      return `Basic ${btoa(`x-access-token:${token}`)}`;
  }
}

function pathSegments(url: URL): string[] {
  return url.pathname.split("/").slice(1);
}

function gitOwner([owner, repo, ...service]: string[]): string | null {
  if (!owner || !repo || !GIT_SERVICES.has(service.join("/"))) {
    return null;
  }
  return owner;
}

function apiOwner([root, owner, repo]: string[]): string | null {
  if (root !== API_REPOS || !owner || !repo) {
    return null;
  }
  return owner;
}
