import type { ExecutionContext } from "hono";
import { describe, expect, test, vi } from "vite-plus/test";

import { createApp } from "@/app";
import type { Config } from "@/lib/config";
import type { SandboxDirectory } from "@/sandbox";
import { migratedDatabase } from "@/testing";
import { userStore } from "@/users";

const APP = "https://app.example.com";
const AUD = "access-aud";
const ADA_GITHUB_ID = 100;

const config: Config = {
  sandboxDomain: "example.com",
  instance: "standard-1",
  inactivityTimeoutMs: 60_000,
  adminToken: "admin",
  accessAud: AUD,
  accessTeamDomain: undefined,
  github: { appId: 1, privateKey: "key" },
  githubSignIn: { slug: "cinder-agent", clientId: "client-id", clientSecret: "client-secret" },
};

function signedIn(email: string): ExecutionContext {
  const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    access: { aud: AUD, getIdentity: async () => ({ email }) },
  };
  return ctx;
}

const unusedSandboxes: SandboxDirectory = {
  get: () => {
    throw new Error("no sandbox in these tests");
  },
};

interface FakeGithub {
  calls: string[];
  challenge: string | null;
  verifier: string | null;
}

const installations = [
  { id: 1, account: { id: ADA_GITHUB_ID, login: "ada-gh", type: "User" } },
  { id: 2, account: { id: 200, login: "ada-org", type: "Organization" } },
  { id: 3, account: { id: 300, login: "member-org", type: "Organization" } },
  { id: 4, account: { id: 400, login: "someone", type: "User" } },
  { id: 5, account: { id: 500, login: "bob-org", type: "Organization" } },
  { id: 6, account: null },
];

function fakeGithub(overrides: { token?: unknown } = {}) {
  const state: FakeGithub = { calls: [], challenge: null, verifier: null };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const auth = new Headers(init?.headers).get("authorization");
    state.calls.push(`${init?.method ?? "GET"} ${url.host}${url.pathname}`);
    if (url.href === "https://github.com/login/oauth/access_token") {
      const body: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "{}");
      expect(body).toMatchObject({
        client_id: "client-id",
        client_secret: "client-secret",
        code: "the-code",
        redirect_uri: `${APP}/github/callback`,
      });
      if (body && typeof body === "object" && "code_verifier" in body) {
        state.verifier = String(body.code_verifier);
      }
      return Response.json(overrides.token ?? { access_token: "ghu_user", token_type: "bearer" });
    }
    expect(auth).toBe("Bearer ghu_user");
    if (url.pathname === "/user") {
      return Response.json({ id: ADA_GITHUB_ID, login: "ada-gh" });
    }
    if (url.pathname === "/user/installations") {
      return Response.json({ total_count: installations.length, installations });
    }
    const org = /^\/user\/memberships\/orgs\/(.+)$/.exec(url.pathname)?.[1];
    if (org === "ada-org" || org === "bob-org") {
      return Response.json({ state: "active", role: "admin" });
    }
    if (org === "member-org") {
      return Response.json({ state: "active", role: "member" });
    }
    return new Response("not found", { status: 404 });
  };
  return { state, fetcher };
}

async function setup(overrides: { token?: unknown } = {}) {
  const users = userStore(migratedDatabase());
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });
  await users.claimInstallation(bob.id, 5, "bob-org");
  const github = fakeGithub(overrides);
  const app = createApp(() => ({
    config,
    users,
    sandboxes: unusedSandboxes,
    fetch: github.fetcher,
    font: null,
  }));
  const request = (path: string, init: RequestInit = {}) =>
    app.request(`${APP}${path}`, init, undefined, signedIn("ada@example.com"));
  return { app, users, ada, bob, github: github.state, request };
}

async function sha256Base64Url(text: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  return btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function startSignIn(request: Awaited<ReturnType<typeof setup>>["request"]) {
  const start = await request("/github/connect");
  const location = new URL(start.headers.get("location") ?? "");
  return {
    state: location.searchParams.get("state") ?? "",
    challenge: location.searchParams.get("code_challenge"),
    cookie: (start.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
  };
}

describe("given GitHub sign-in is set up", () => {
  test("when the user installs the App, then they are sent to its install page", async () => {
    const { request } = await setup();

    const response = await request("/github/install");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://github.com/apps/cinder-agent/installations/new",
    );
  });

  test.each(["/github/setup?installation_id=5&setup_action=install", "/github/connect"])(
    "when %s is opened, then sign-in starts with state and PKCE in a __Host- cookie",
    async (path) => {
      const { request } = await setup();

      const response = await request(path);

      expect(response.status).toBe(303);
      const location = new URL(response.headers.get("location") ?? "");
      expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
      expect(Object.fromEntries(location.searchParams)).toEqual({
        client_id: "client-id",
        redirect_uri: `${APP}/github/callback`,
        state: expect.stringMatching(/^[\w-]{43}$/),
        code_challenge: expect.stringMatching(/^[\w-]{43}$/),
        code_challenge_method: "S256",
      });
      const cookie = response.headers.get("set-cookie") ?? "";
      expect(cookie).toMatch(/^__Host-github_oauth=[\w-]+\.[\w-]+;/);
      for (const attribute of ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"]) {
        expect(cookie).toContain(attribute);
      }
    },
  );
});

describe("given a sign-in started in this browser", () => {
  test("when GitHub calls back, then the account and only the owned installations are linked", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { request, users, ada, bob, github } = await setup();
    const { state, challenge, cookie } = await startSignIn(request);

    const callback = await request(`/github/callback?code=the-code&state=${state}`, {
      headers: { cookie },
    });

    expect(callback.status).toBe(200);
    expect(callback.headers.get("set-cookie")).toMatch(/^__Host-github_oauth=;.*Max-Age=0/);
    const page = await callback.text();
    expect(page).toContain("ada-gh");
    expect(page).toContain("Another user already linked it.");
    expect(page).toContain("Only the account owner or an organization admin can link it.");
    expect(await sha256Base64Url(github.verifier ?? "")).toBe(challenge);
    expect(await users.githubAccount(ada.id)).toEqual({
      githubUserId: ADA_GITHUB_ID,
      login: "ada-gh",
    });
    expect(
      (await users.installations(ada.id)).map((i) => [i.installationId, i.accountLogin]),
    ).toEqual([
      [1, "ada-gh"],
      [2, "ada-org"],
    ]);
    expect((await users.installations(bob.id)).map((i) => i.installationId)).toEqual([5]);
    expect(github.calls).toContain("GET api.github.com/user/memberships/orgs/member-org");
    expect(github.calls).not.toContain("GET api.github.com/user/memberships/orgs/someone");
  });

  test.each<[string, string, (cookie: string) => HeadersInit]>([
    ["no cookie", "&state=forged", () => ({})],
    ["a forged state", "&state=forged", (cookie) => ({ cookie })],
    ["a forged cookie", "&state=forged", () => ({ cookie: "__Host-github_oauth=x.y" })],
    ["no state", "", (cookie) => ({ cookie })],
  ])("when GitHub calls back with %s, then nothing is linked", async (_label, query, headers) => {
    const { request, users, ada, github } = await setup();
    const { cookie } = await startSignIn(request);

    const response = await request(`/github/callback?code=the-code${query}`, {
      headers: headers(cookie),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "github_state_mismatch" });
    expect(github.calls).toEqual([]);
    expect(await users.githubAccount(ada.id)).toBeNull();
  });
});

describe("given GitHub refuses the code", () => {
  test("when GitHub calls back, then it is a sign-in failure and nothing is linked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { request, users, ada } = await setup({ token: { error: "bad_verification_code" } });
    const { state, cookie } = await startSignIn(request);

    const response = await request(`/github/callback?code=the-code&state=${state}`, {
      headers: { cookie },
    });

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "github_sign_in_failed" });
    expect(await users.installations(ada.id)).toEqual([]);
  });
});

describe("given Ada has installation 1 and Bob has installation 5", () => {
  async function unlinkSetup() {
    const context = await setup();
    await context.users.claimInstallation(context.ada.id, 1, "ada-gh");
    const unlink = (id: string) =>
      context.request(`/github/installations/${id}/delete`, {
        method: "POST",
        headers: { origin: APP, "content-type": "application/x-www-form-urlencoded" },
      });
    return { ...context, unlink };
  }

  test.each(["5", "abc"])("when Ada unlinks %s, then it is not found", async (id) => {
    const { unlink, users, bob } = await unlinkSetup();

    const response = await unlink(id);

    expect(response.status).toBe(404);
    expect((await users.installations(bob.id)).map((i) => i.installationId)).toEqual([5]);
  });

  test("when Ada unlinks 1, then it is removed and she goes back to the dashboard", async () => {
    const { unlink, users, ada } = await unlinkSetup();

    const response = await unlink("1");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(await users.installations(ada.id)).toEqual([]);
  });
});
