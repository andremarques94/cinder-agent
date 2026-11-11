export const GITHUB_HOSTS = ["github.com", "api.github.com"] as const;

export const TOKEN_PLACEHOLDER = "cinder-placeholder";

const GIT_PATH = /^\/[^/]+\/[^/]+\/(?:info\/refs|git-upload-pack|git-receive-pack)$/;

// https://developers.cloudflare.com/sandbox/network/clone-a-private-repository/
export async function authorizeGithubRequest(
  request: Request,
  token: () => Promise<string>,
): Promise<Request> {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  if (url.protocol === "https:" && url.hostname === "api.github.com") {
    headers.set("authorization", `Bearer ${await token()}`);
  } else if (
    url.protocol === "https:" &&
    url.hostname === "github.com" &&
    GIT_PATH.test(url.pathname)
  ) {
    headers.set("authorization", `Basic ${btoa(`x-access-token:${await token()}`)}`);
  }
  return new Request(request, { headers });
}
