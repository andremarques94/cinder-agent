import { describe, expect, test, vi } from "vite-plus/test";

import { ErrorCode, GatewayError } from "@/lib/errors";

import { githubApp } from "./github-app.ts";

const privateKey = await generatePkcs8Key();

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

describe("given a GitHub App that GitHub accepts", () => {
  test("when a token is asked for twice, then it is minted once with the app JWT", async () => {
    const calls = stubGithub({ "POST /app/installations/34/access_tokens": tokenResponse });
    const app = githubApp({ appId: 1, privateKey });

    const first = await app.installationToken(34);
    const second = await app.installationToken(34);

    expect([first, second]).toEqual(["ghs_real", "ghs_real"]);
    expect(calls).toEqual(["POST /app/installations/34/access_tokens bearer"]);
  });

  test("when the bot identity is asked for, then it comes from the app slug and bot user", async () => {
    stubGithub({
      "POST /app/installations/34/access_tokens": tokenResponse,
      "GET /app": () => Response.json({ slug: "cinder" }),
      "GET /users/cinder%5Bbot%5D": () => Response.json({ id: 99 }),
    });
    const app = githubApp({ appId: 2, privateKey });

    const identity = await app.botIdentity(34);

    expect(identity).toEqual({
      name: "cinder[bot]",
      email: "99+cinder[bot]@users.noreply.github.com",
    });
  });
});

describe("given a GitHub App that GitHub refuses", () => {
  test("when a token or the bot identity is asked for, then it is a github_unavailable error", async () => {
    stubGithub({});
    const app = githubApp({ appId: 3, privateKey });

    const results = await Promise.allSettled([app.installationToken(34), app.botIdentity(34)]);

    for (const result of results) {
      expect(result).toEqual({ status: "rejected", reason: expect.any(GatewayError) });
      expect(result).toHaveProperty("reason.code", ErrorCode.GithubUnavailable);
    }
  });
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
