import { afterEach, expect, test, vi } from "vite-plus/test";

import { ErrorCode, GatewayError } from "@/errors";

import { githubApp } from "./github-app.ts";

const privateKey = await generatePkcs8Key();

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubGithub(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const route = `${request.method} ${new URL(request.url).pathname}`;
    calls.push(`${route} ${request.headers.get("authorization")?.split(" ")[0] ?? "none"}`);
    return routes[route]?.() ?? new Response("{}", { status: 404 });
  });
  return calls;
}

const tokenResponse = () =>
  Response.json(
    { token: "ghs_real", expires_at: new Date(Date.now() + 3_600_000).toISOString() },
    { status: 201 },
  );

test("installation tokens are minted with the app JWT and cached", async () => {
  const calls = stubGithub({ "POST /app/installations/34/access_tokens": tokenResponse });
  const app = githubApp({ appId: 1, privateKey });

  expect(await app.installationToken(34)).toBe("ghs_real");
  expect(await app.installationToken(34)).toBe("ghs_real");
  expect(calls).toEqual(["POST /app/installations/34/access_tokens bearer"]);
});

test("the bot identity comes from the app slug and its bot user", async () => {
  stubGithub({
    "POST /app/installations/34/access_tokens": tokenResponse,
    "GET /app": () => Response.json({ slug: "cinder" }),
    "GET /users/cinder%5Bbot%5D": () => Response.json({ id: 99 }),
  });
  const app = githubApp({ appId: 2, privateKey });

  expect(await app.botIdentity(34)).toEqual({
    name: "cinder[bot]",
    email: "99+cinder[bot]@users.noreply.github.com",
  });
});

test("GitHub refusing the credentials is a github_unavailable error", async () => {
  stubGithub({});
  const app = githubApp({ appId: 3, privateKey });

  const error = await app.installationToken(34).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(GatewayError);
  expect(error).toHaveProperty("code", ErrorCode.GithubUnavailable);
  await expect(app.botIdentity(34)).rejects.toHaveProperty("code", ErrorCode.GithubUnavailable);
});

async function generatePkcs8Key(): Promise<string> {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("privateKey" in keys)) {
    throw new Error("expected a key pair");
  }
  const der = await crypto.subtle.exportKey("pkcs8", keys.privateKey);
  if (!(der instanceof ArrayBuffer)) {
    throw new Error("expected DER bytes");
  }
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));
  const label = "PRIVATE KEY";
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----`;
}
