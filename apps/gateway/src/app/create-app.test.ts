import type { ExecutionContext } from "hono";
import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { Config } from "@/lib/config";
import type { SandboxDirectory, SandboxHandle } from "@/sandbox";
import { migratedDatabase } from "@/testing";
import { userStore, type User } from "@/users";

import { createApp } from "./create-app.ts";

const ADMIN = "https://gw.acct.workers.dev";
const APP = "https://app.example.com";
const TOKEN = "admin-secret";
const AUD = "access-aud";

const config: Config = {
  sandboxDomain: "example.com",
  instance: "standard-1",
  inactivityTimeoutMs: 60_000,
  adminToken: TOKEN,
  accessAud: AUD,
  accessTeamDomain: undefined,
  github: null,
  githubSignIn: null,
};

interface Options {
  failPairing?: boolean;
  pairingCode?: string;
  config?: Partial<Config>;
  fetch?: typeof fetch;
}

async function gateway(options: Options = {}) {
  const users = userStore(migratedDatabase());
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });
  const owner = new Map([ada, bob].map((user) => [user.id, user.sandbox]));

  const calls: string[] = [];
  const handle = (userId: string): SandboxHandle => {
    const name = owner.get(userId) ?? `unknown user ${userId}`;
    return {
      fetch: async (request) => {
        const url = new URL(request.url);
        calls.push(`${name} fetch ${url.host}${url.pathname}`);
        return new Response(`sandbox ${name}`);
      },
      pair: async () => {
        calls.push(`${name} pair`);
        if (options.failPairing) {
          throw new Error("container failed to start");
        }
        return { code: options.pairingCode ?? "one-time-code", expiresIn: 300 };
      },
      status: async () => ({ running: true, ready: true, version: "2.2.7", lastSavedAt: null }),
      stop: async () => {
        calls.push(`${name} stop`);
      },
      destroy: async () => {
        calls.push(`${name} destroy`);
      },
    };
  };
  const sandboxes: SandboxDirectory = { get: handle };
  const app = createApp(() => ({
    config: { ...config, ...options.config },
    sandboxes,
    users,
    fetch: options.fetch ?? noNetwork,
  }));
  return { app, calls, users, ada, bob };
}

function signedIn(email: string | undefined, aud = AUD): ExecutionContext {
  const ctx = {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    access: { aud, getIdentity: async () => (email ? { email } : undefined) },
  };
  return ctx;
}

const noNetwork: typeof fetch = async (input) => {
  throw new Error(`unexpected fetch: ${input instanceof Request ? input.url : input.toString()}`);
};

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });
const post = (init: RequestInit = {}) => ({ ...init, method: "POST" });
const json = (method: string, body: unknown) => ({
  method,
  headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
  body: JSON.stringify(body),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sandbox hostnames", () => {
  test("go to the owner's sandbox, unchanged, and only theirs", async () => {
    const { app, calls } = await gateway();
    expect(await (await app.request("https://ada.example.com/api/session?x=1")).text()).toBe(
      "sandbox ada",
    );
    expect(await (await app.request("https://bob.example.com/")).text()).toBe("sandbox bob");
    expect(calls).toEqual(["ada fetch ada.example.com/api/session", "bob fetch bob.example.com/"]);
  });

  test("nothing in the request but the hostname picks the sandbox", async () => {
    const { app, calls } = await gateway();
    await app.request("https://ada.example.com/bob?sandbox=bob", {
      headers: { host: "bob.example.com", "x-forwarded-host": "bob.example.com" },
    });
    expect(calls).toEqual(["ada fetch ada.example.com/bob"]);
  });

  test("never reach the admin API or the signed-in app, even with a valid token", async () => {
    const { app, calls } = await gateway();
    const admin = await app.request("https://ada.example.com/admin/sandboxes/bob/pair", {
      ...post(),
      ...bearer(TOKEN),
    });
    expect(await admin.text()).toBe("sandbox ada");
    await app.request(
      "https://ada.example.com/api/pair",
      post(),
      undefined,
      signedIn("bob@example.com"),
    );
    expect(calls).toEqual([
      "ada fetch ada.example.com/admin/sandboxes/bob/pair",
      "ada fetch ada.example.com/api/pair",
    ]);
  });

  test("names with no user, nested and reserved names get 404 and no sandbox is touched", async () => {
    const { app, calls } = await gateway();
    for (const url of [
      "https://eve.example.com/",
      "https://ada.bob.example.com/",
      "https://api.example.com/",
      "https://ada.example.com.evil.test/",
    ]) {
      const response = await app.request(url);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: "not_found" });
    }
    expect(calls).toEqual([]);
  });

  test("a deleted user's hostname is gone", async () => {
    const { app, calls, users, ada } = await gateway();
    await users.delete(ada.id);
    expect((await app.request("https://ada.example.com/")).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("signed-in app", () => {
  test("shows each user only their own sandbox", async () => {
    const { app } = await gateway();
    for (const [email, sandbox] of [
      ["ada@example.com", "ada"],
      ["BOB@example.com", "bob"],
    ]) {
      const response = await app.request(`${APP}/api/me`, {}, undefined, signedIn(email));
      expect(await response.json()).toEqual({
        email: email.toLowerCase(),
        sandbox,
        server: `https://${sandbox}.example.com`,
      });
    }
  });

  test("pairs the signed-in user's sandbox, whatever else the request names", async () => {
    const { app, calls } = await gateway();
    const response = await app.request(
      `${APP}/api/pair?sandbox=bob&user=bob@example.com`,
      post({
        headers: { "content-type": "application/json", "x-sandbox": "bob" },
        body: JSON.stringify({ sandbox: "bob", email: "bob@example.com" }),
      }),
      undefined,
      signedIn("ada@example.com"),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      url: "https://ada.example.com/auth/connect/one-time-code",
      server: "https://ada.example.com",
      expiresIn: 300,
    });
    expect(calls).toEqual(["ada pair"]);
  });

  test("the pair form shows a QR code of the link; another site can't submit it", async () => {
    const { app, calls } = await gateway();
    const form = (origin: string) =>
      app.request(
        `${APP}/devices/pair`,
        post({
          headers: { "content-type": "application/x-www-form-urlencoded", origin },
          body: "",
        }),
        undefined,
        signedIn("bob@example.com"),
      );

    const ours = await form(APP);
    expect(ours.status).toBe(200);
    expect(ours.headers.get("cache-control")).toBe("no-store");
    const page = await ours.text();
    expect(page).toContain("<svg");
    expect(page).toContain("https://bob.example.com/auth/connect/one-time-code");
    expect(page).toContain("expires in 5 minutes");

    const theirs = await form("https://evil.test");
    expect(theirs.status).toBe(403);
    expect(await theirs.json()).toMatchObject({ error: "cross_site_request" });
    expect(calls).toEqual(["bob pair"]);
  });

  test("the home page shows the user's server, status and GitHub links", async () => {
    const { app, users, ada } = await gateway();
    await users.claimInstallation(ada.id, 41, "ada-org");
    await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada-gh" });
    const page = await app.request(`${APP}/`, {}, undefined, signedIn("ada@example.com"));
    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html).toContain('<a href="https://ada.example.com">');
    expect(html).toContain('action="/devices/pair"');
    expect(html).toContain("ada-gh");
    expect(html).toContain('action="/github/installations/41/delete"');
    expect(html).toContain("running");
    expect(html).toContain("2.2.7");
    expect(html).toContain("GitHub isn&#39;t set up on this gateway.");
  });

  test("the home page still renders when the sandbox can't report its status", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { users } = await gateway();
    const down = () => Promise.reject(new Error("down"));
    const app = createApp(() => ({
      config,
      users,
      fetch: noNetwork,
      sandboxes: {
        get: () => ({ fetch: down, pair: down, status: down, stop: down, destroy: down }),
      },
    }));
    const page = await app.request(`${APP}/`, {}, undefined, signedIn("ada@example.com"));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("unavailable");
  });

  test("browsers get an HTML error page, other clients JSON", async () => {
    const { app } = await gateway();
    const html = await app.request(
      `${APP}/github/install`,
      { headers: { accept: "text/html" } },
      undefined,
      signedIn("ada@example.com"),
    );
    expect(html.status).toBe(404);
    expect(await html.text()).toContain("GitHub sign-in is not set up on this gateway.");
    const json = await app.request(
      `${APP}/github/install`,
      {},
      undefined,
      signedIn("ada@example.com"),
    );
    expect(await json.json()).toMatchObject({ error: "github_sign_in_not_configured" });
  });

  test("records the sign-in", async () => {
    const { app, users, ada } = await gateway();
    await app.request(`${APP}/api/me`, {}, undefined, signedIn("ada@example.com"));
    expect((await users.byId(ada.id))?.lastLoginAt).toEqual(expect.any(Number));
  });

  test("without a valid Access identity nothing is reached", async () => {
    const cases: [ExecutionContext | undefined, Partial<Config>][] = [
      [undefined, {}],
      [signedIn(undefined), {}],
      [signedIn("ada@example.com", "another-app"), {}],
      [signedIn("ada@example.com"), { accessAud: undefined }],
    ];
    for (const [ctx, overrides] of cases) {
      const { app, calls } = await gateway({ config: overrides });
      const response = await app.request(`${APP}/api/pair`, post(), undefined, ctx);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "not_signed_in" });
      expect(calls).toEqual([]);
    }
  });

  test("an Access user who wasn't invited is refused", async () => {
    const { app, calls } = await gateway();
    const response = await app.request(`${APP}/api/me`, {}, undefined, signedIn("eve@example.com"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "not_invited" });
    expect(calls).toEqual([]);
  });

  test("a revoked user loses access straight away", async () => {
    const { app, users, ada } = await gateway();
    await users.delete(ada.id);
    const response = await app.request(`${APP}/api/me`, {}, undefined, signedIn("ada@example.com"));
    expect(response.status).toBe(403);
  });

  test("the admin API is not served on the app hostname", async () => {
    const { app, calls } = await gateway();
    for (const path of ["/admin/users", "/admin/sandboxes/bob"]) {
      const response = await app.request(
        `${APP}${path}`,
        bearer(TOKEN),
        undefined,
        signedIn("ada@example.com"),
      );
      expect(response.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });
});

describe("admin API", () => {
  test("rejects a missing or wrong token before anything else", async () => {
    const { app, calls } = await gateway();
    for (const path of ["/admin/sandboxes/ada", "/admin/users", "/admin/sandboxes/eve"]) {
      const missing = await app.request(`${ADMIN}${path}`);
      expect(missing.status).toBe(401);
      expect(await missing.json()).toMatchObject({ error: "unauthorized" });
      expect((await app.request(`${ADMIN}${path}`, bearer("nope"))).status).toBe(401);
    }
    expect(calls).toEqual([]);
  });

  test("rejects everything when no admin token is configured", async () => {
    const { app } = await gateway({ config: { adminToken: undefined } });
    expect((await app.request(`${ADMIN}/admin/users`, bearer(""))).status).toBe(401);
  });

  test("invites a user, who then gets their own sandbox", async () => {
    const { app, calls } = await gateway();
    const created = await app.request(
      `${ADMIN}/admin/users`,
      json("POST", { email: " Cy@Example.com ", sandbox: "cy" }),
    );
    expect(created.status).toBe(201);
    const cy = v.parse(v.object({ id: v.string(), email: v.string() }), await created.json());
    expect(cy.email).toBe("cy@example.com");

    const me = await app.request(`${APP}/api/me`, {}, undefined, signedIn("cy@example.com"));
    expect(await me.json()).toMatchObject({ sandbox: "cy" });
    await app.request("https://cy.example.com/");
    expect(calls).toEqual([`unknown user ${cy.id} fetch cy.example.com/`]);
  });

  test("refuses bad or taken names and emails", async () => {
    const { app } = await gateway();
    for (const body of [
      { email: "cy@example.com", sandbox: "app" },
      { email: "cy@example.com", sandbox: "Cy" },
      { email: "cy@example.com", sandbox: "c.y" },
      { email: "not-an-email", sandbox: "cy" },
      { sandbox: "cy" },
    ]) {
      const response = await app.request(`${ADMIN}/admin/users`, json("POST", body));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_request" });
    }
    for (const body of [
      { email: "ada@example.com", sandbox: "cy" },
      { email: "cy@example.com", sandbox: "bob" },
    ]) {
      const response = await app.request(`${ADMIN}/admin/users`, json("POST", body));
      expect(response.status).toBe(409);
    }
  });

  test("deleting a user destroys their sandbox and retires the name", async () => {
    const { app, calls, ada } = await gateway();
    const deleted = await app.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}));
    expect(deleted.status).toBe(204);
    expect(calls).toEqual(["ada destroy"]);
    expect((await app.request("https://ada.example.com/")).status).toBe(404);
    const again = await app.request(
      `${ADMIN}/admin/users`,
      json("POST", { email: "eve@example.com", sandbox: "ada" }),
    );
    expect(again.status).toBe(409);
    expect((await app.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}))).status).toBe(
      404,
    );
  });

  test("a failed destroy keeps the user, so it can be retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { users, ada } = await gateway();
    const down = () => Promise.reject(new Error("down"));
    const broken = createApp(() => ({
      config,
      users,
      fetch: noNetwork,
      sandboxes: {
        get: () => ({ fetch: down, pair: down, status: down, stop: down, destroy: down }),
      },
    }));
    const response = await broken.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}));
    expect(response.status).toBe(503);
    expect(await users.byId(ada.id)).not.toBeNull();
  });

  test("links GitHub App installations to one user each", async () => {
    const { app, users, ada, bob } = await gateway();
    const link = (user: User, body: unknown) =>
      app.request(`${ADMIN}/admin/users/${user.id}/github`, json("PUT", body));
    const ids = async (user: User) =>
      (await users.installations(user.id)).map((installation) => installation.installationId);

    expect((await link(ada, { installationId: 34, accountLogin: "ada" })).status).toBe(204);
    expect((await link(ada, { installationId: 35, accountLogin: "ada-org" })).status).toBe(204);
    expect(await ids(ada)).toEqual([34, 35]);
    expect((await link(bob, { installationId: 34 })).status).toBe(409);
    expect((await link(bob, { installationId: "34" })).status).toBe(400);
    expect((await link(bob, { installationId: 0 })).status).toBe(400);

    const list = await app.request(`${ADMIN}/admin/users`, bearer(TOKEN));
    expect(
      v
        .parse(
          v.array(v.object({ sandbox: v.string(), installationIds: v.array(v.number()) })),
          await list.json(),
        )
        .map((user) => [user.sandbox, user.installationIds]),
    ).toEqual([
      ["ada", [34, 35]],
      ["bob", []],
    ]);

    const cleared = await app.request(`${ADMIN}/admin/users/${ada.id}/github`, json("DELETE", {}));
    expect(cleared.status).toBe(204);
    expect(await ids(ada)).toEqual([]);
    expect(
      (await app.request(`${ADMIN}/admin/users/missing/github`, json("PUT", { installationId: 1 })))
        .status,
    ).toBe(404);
  });

  test("pair returns a one-time link on the sandbox's hostname", async () => {
    const { app, calls } = await gateway();
    const response = await app.request(`${ADMIN}/admin/sandboxes/ada/pair`, {
      ...post(),
      ...bearer(TOKEN),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      url: "https://ada.example.com/auth/connect/one-time-code",
      server: "https://ada.example.com",
      expiresIn: 300,
    });
    expect(calls).toEqual(["ada pair"]);
  });

  test("status and stop", async () => {
    const { app, calls } = await gateway();
    const status = await app.request(`${ADMIN}/admin/sandboxes/bob`, bearer(TOKEN));
    expect(await status.json()).toEqual({
      running: true,
      ready: true,
      version: "2.2.7",
      lastSavedAt: null,
    });
    const stop = await app.request(`${ADMIN}/admin/sandboxes/bob`, {
      method: "DELETE",
      ...bearer(TOKEN),
    });
    expect(stop.status).toBe(204);
    expect(calls).toEqual(["bob stop"]);
  });

  test("unknown sandboxes and users, wrong methods and other paths are 404", async () => {
    const { app, calls } = await gateway();
    expect((await app.request(`${ADMIN}/admin/sandboxes/eve`, bearer(TOKEN))).status).toBe(404);
    expect((await app.request(`${ADMIN}/admin/sandboxes/ada/pair`, bearer(TOKEN))).status).toBe(
      404,
    );
    expect((await app.request(`${ADMIN}/admin/users/missing`, json("DELETE", {}))).status).toBe(
      404,
    );
    expect((await app.request(`${ADMIN}/`)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test("a sandbox that fails gets a coded 503, and the cause is logged, not returned", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = await gateway({ failPairing: true });
    const response = await app.request(`${ADMIN}/admin/sandboxes/ada/pair`, {
      ...post(),
      ...bearer(TOKEN),
    });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ error: "sandbox_unavailable" });
    expect(body).not.toContain("container failed to start");
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sandbox_unavailable", sandbox: "ada" }),
    );
  });

  test("a strange pairing code is encoded, so it can't change where the link points", async () => {
    const { app } = await gateway({ pairingCode: "../../evil?x=1#y" });
    const response = await app.request(`${ADMIN}/admin/sandboxes/ada/pair`, {
      ...post(),
      ...bearer(TOKEN),
    });
    const { url } = v.parse(v.object({ url: v.string() }), await response.json());
    expect(url).toBe("https://ada.example.com/auth/connect/..%2F..%2Fevil%3Fx%3D1%23y");
    expect(new URL(url).pathname.startsWith("/auth/connect/")).toBe(true);
  });
});
