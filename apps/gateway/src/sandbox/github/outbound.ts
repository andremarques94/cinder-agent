export const GITHUB_HOSTS = ["github.com", "api.github.com"] as const;

export const TOKEN_PLACEHOLDER = "cinder-placeholder";

const GIT_PATH = /^\/[^/]+\/[^/]+\/(?:info\/refs|git-upload-pack|git-receive-pack)$/;

const API_REPO_PATH = /^\/repos\/([^/]+)\/[^/]+(?:\/|$)/;

export interface OwnedInstallation {
  installationId: number;
  accountLogin: string | null;
}

export type TokenFor = (owner: string | null) => Promise<string | null>;

export function repositoryOwner(url: URL): string | null {
  if (url.hostname === "github.com" && GIT_PATH.test(url.pathname)) {
    return url.pathname.split("/")[1]?.toLowerCase() ?? null;
  }
  if (url.hostname === "api.github.com") {
    return API_REPO_PATH.exec(url.pathname)?.[1]?.toLowerCase() ?? null;
  }
  return null;
}

export function pickInstallation(
  installations: readonly OwnedInstallation[],
  owner: string | null,
  ownLogin: string | null,
): number | null {
  const on = (login: string | null) =>
    login === null
      ? undefined
      : installations.find((i) => i.accountLogin?.toLowerCase() === login.toLowerCase());
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
  const api = url.protocol === "https:" && url.hostname === "api.github.com";
  const git =
    url.protocol === "https:" && url.hostname === "github.com" && GIT_PATH.test(url.pathname);
  const token = api || git ? await tokenFor(repositoryOwner(url)) : null;
  if (token && api) {
    headers.set("authorization", `Bearer ${token}`);
  } else if (token && git) {
    headers.set("authorization", `Basic ${btoa(`x-access-token:${token}`)}`);
  }
  return new Request(request, { headers });
}
