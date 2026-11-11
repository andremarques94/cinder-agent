import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";

import { ErrorCode, GatewayError } from "@/lib/errors";

const COOKIE = "github_oauth";
const MAX_AGE_SECONDS = 600;

export interface OauthState {
  state: string;
  verifier: string;
  challenge: string;
}

// https://datatracker.ietf.org/doc/html/rfc7636#section-4
export async function newOauthState(): Promise<OauthState> {
  const state = randomToken();
  const verifier = randomToken();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { state, verifier, challenge: base64Url(new Uint8Array(digest)) };
}

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#cookie_prefixes
export function rememberOauthState(c: Context, { state, verifier }: OauthState): void {
  setCookie(c, COOKIE, `${state}.${verifier}`, {
    prefix: "host",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function takeOauthVerifier(c: Context, state: string | undefined): string {
  const stored = deleteCookie(c, COOKIE, { prefix: "host" });
  const [expected, verifier] = stored?.split(".") ?? [];
  if (!state || !expected || !verifier || state !== expected) {
    throw new GatewayError(ErrorCode.GithubStateMismatch);
  }
  return verifier;
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
