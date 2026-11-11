import type { ExecutionContext } from "hono";
import * as v from "valibot";
import { describe, expect, test, vi } from "vite-plus/test";

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
  font?: ArrayBuffer;
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
    font: options.font ?? null,
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

const asAda = signedIn("ada@example.com");
const form = (origin: string) =>
  post({ headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: "" });

describe("given a request to a sandbox hostname", () => {
  test("when it names Ada's or Bob's sandbox, then it reaches only that sandbox, unchanged", async () => {
    const { app, calls } = await gateway();

    const ada = await app.request("https://ada.example.com/api/session?x=1");
    const bob = await app.request("https://bob.example.com/");

    expect(await ada.text()).toBe("sandbox ada");
    expect(await bob.text()).toBe("sandbox bob");
    expect(calls).toEqual(["ada fetch ada.example.com/api/session", "bob fetch bob.example.com/"]);
  });

  test("when other parts of the request name Bob, then the hostname still picks Ada", async () => {
    const { app, calls } = await gateway();

    await app.request("https://ada.example.com/bob?sandbox=bob", {
      headers: { host: "bob.example.com", "x-forwarded-host": "bob.example.com" },
    });

    expect(calls).toEqual(["ada fetch ada.example.com/bob"]);
  });

  test("when it carries an admin token or an Access identity, then it still only reaches the sandbox", async () => {
    const { app, calls } = await gateway();

    const admin = await app.request("https://ada.example.com/admin/sandboxes/bob/pair", {
      ...post(),
      ...bearer(TOKEN),
    });
    await app.request(
      "https://ada.example.com/api/pair",
      post(),
      undefined,
      signedIn("bob@example.com"),
    );

    expect(await admin.text()).toBe("sandbox ada");
    expect(calls).toEqual([
      "ada fetch ada.example.com/admin/sandboxes/bob/pair",
      "ada fetch ada.example.com/api/pair",
    ]);
  });

  test.each([
    "https://eve.example.com/",
    "https://ada.bob.example.com/",
    "https://api.example.com/",
    "https://ada.example.com.evil.test/",
  ])("when it is %s, then it is 404 and no sandbox is touched", async (url) => {
    const { app, calls } = await gateway();

    const response = await app.request(url);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
    expect(calls).toEqual([]);
  });

  test("when the user was deleted, then their hostname is gone", async () => {
    const { app, calls, users, ada } = await gateway();
    await users.delete(ada.id);

    const response = await app.request("https://ada.example.com/");

    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("given a signed-in user on the app hostname", () => {
  test.each([
    ["ada@example.com", "ada"],
    ["BOB@example.com", "bob"],
  ])("when %s asks who they are, then they see only the %s sandbox", async (email, sandbox) => {
    const { app } = await gateway();

    const response = await app.request(`${APP}/api/me`, {}, undefined, signedIn(email));

    expect(await response.json()).toEqual({
      email: email.toLowerCase(),
      sandbox,
      server: `https://${sandbox}.example.com`,
    });
  });

  test("when they pair while naming Bob in the request, then Ada's sandbox is paired", async () => {
    const { app, calls } = await gateway();

    const response = await app.request(
      `${APP}/api/pair?sandbox=bob&user=bob@example.com`,
      post({
        headers: { "content-type": "application/json", "x-sandbox": "bob" },
        body: JSON.stringify({ sandbox: "bob", email: "bob@example.com" }),
      }),
      undefined,
      asAda,
    );

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      url: "https://ada.example.com/auth/connect/one-time-code",
      server: "https://ada.example.com",
      expiresIn: 300,
    });
    expect(calls).toEqual(["ada pair"]);
  });

  test("when they submit the pair form, then they see a QR code of the one-time link", async () => {
    const { app, calls } = await gateway();

    const response = await app.request(`${APP}/devices/pair`, form(APP), undefined, asAda);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = await response.text();
    expect(page).toContain("<svg");
    expect(page).toContain("https://ada.example.com/auth/connect/one-time-code");
    expect(page).toContain("Expires in 5:00");
    expect(page).toContain("Copy link");
    expect(calls).toEqual(["ada pair"]);
  });

  test("when another site submits the pair form, then it is refused", async () => {
    const { app, calls } = await gateway();

    const response = await app.request(
      `${APP}/devices/pair`,
      form("https://evil.test"),
      undefined,
      asAda,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "cross_site_request" });
    expect(calls).toEqual([]);
  });

  test("when they open the home page, then it shows their server, status and GitHub links", async () => {
    const { app, users, ada } = await gateway({
      config: { github: { appId: 1, privateKey: "key" } },
    });
    await users.claimInstallation(ada.id, 41, "ada-org");
    await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada-gh" });

    const page = await app.request(`${APP}/`, {}, undefined, asAda);

    expect(page.headers.get("content-type")).toContain("text/html");
    const html = await page.text();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    for (const expected of [
      '<a href="https://ada.example.com">ada.example.com</a>',
      '<dd class="ok">Running</dd>',
      "2.2.7",
      'action="/devices/pair"',
      "https://github.com/ada-gh.png",
      "ada-org",
      "Organization",
      'action="/github/installations/41/delete"',
      "Ask the admin to link more accounts.",
    ]) {
      expect(html).toContain(expected);
    }
  });

  test("when they open the home page and the sandbox can't report its status, then it still renders", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { users } = await gateway();
    const down = () => Promise.reject(new Error("down"));
    const app = createApp(() => ({
      config,
      users,
      fetch: noNetwork,
      font: null,
      sandboxes: {
        get: () => ({ fetch: down, pair: down, status: down, stop: down, destroy: down }),
      },
    }));

    const page = await app.request(`${APP}/`, {}, undefined, asAda);

    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Unknown<small>can&#39;t reach it</small>");
    expect(html).not.toContain('<dd class="ok">');
  });

  test("when GitHub isn't set up on the gateway, then the home page has no GitHub section", async () => {
    const { app, users, ada } = await gateway();
    await users.claimInstallation(ada.id, 41, "ada-org");

    const page = await app.request(`${APP}/`, {}, undefined, asAda);

    const html = await page.text();
    expect(html).not.toContain('id="github"');
    expect(html).not.toContain('href="/#github"');
    expect(html).not.toContain("ada-org");
  });

  test("when a browser hits an error, then it gets an HTML page", async () => {
    const { app } = await gateway();

    const page = await app.request(
      `${APP}/github/install`,
      { headers: { accept: "text/html" } },
      undefined,
      asAda,
    );

    expect(page.status).toBe(404);
    expect(await page.text()).toContain("GitHub sign-in is not set up on this gateway.");
  });

  test("when the page loads its font, then it is served as a cached woff2", async () => {
    const font = new Uint8Array([0x77, 0x4f, 0x46, 0x32]).buffer;
    const { app } = await gateway({ font });

    const response = await app.request(`${APP}/fonts/inter.woff2`, {}, undefined, asAda);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/woff2");
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(font));
  });

  test("when no font is bundled, then the font is not found", async () => {
    const { app } = await gateway();

    const response = await app.request(`${APP}/fonts/inter.woff2`, {}, undefined, asAda);

    expect(response.status).toBe(404);
  });

  test("when another client hits an error, then it gets JSON", async () => {
    const { app } = await gateway();

    const response = await app.request(`${APP}/github/install`, {}, undefined, asAda);

    expect(await response.json()).toMatchObject({ error: "github_sign_in_not_configured" });
  });

  test("when they make any request, then the sign-in is recorded", async () => {
    const { app, users, ada } = await gateway();

    await app.request(`${APP}/api/me`, {}, undefined, asAda);

    expect((await users.byId(ada.id))?.lastLoginAt).toEqual(expect.any(Number));
  });

  test.each(["/admin/users", "/admin/sandboxes/bob"])(
    "when they call the admin API at %s, then it isn't served on the app hostname",
    async (path) => {
      const { app, calls } = await gateway();

      const response = await app.request(`${APP}${path}`, bearer(TOKEN), undefined, asAda);

      expect(response.status).toBe(404);
      expect(calls).toEqual([]);
    },
  );
});

describe("given a request to the app hostname without a valid Access identity", () => {
  test.each<[string, ExecutionContext | undefined, Partial<Config>]>([
    ["no ctx.access", undefined, {}],
    ["no email", signedIn(undefined), {}],
    ["another application's audience", signedIn("ada@example.com", "another-app"), {}],
    ["no audience configured", asAda, { accessAud: undefined }],
  ])("when it has %s, then nothing is reached", async (_label, ctx, overrides) => {
    const { app, calls } = await gateway({ config: overrides });

    const response = await app.request(`${APP}/api/pair`, post(), undefined, ctx);

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "not_signed_in" });
    expect(calls).toEqual([]);
  });

  test("when the Access user wasn't invited, then they are refused", async () => {
    const { app, calls } = await gateway();

    const response = await app.request(`${APP}/api/me`, {}, undefined, signedIn("eve@example.com"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "not_invited" });
    expect(calls).toEqual([]);
  });

  test("when the user was revoked, then they lose access straight away", async () => {
    const { app, users, ada } = await gateway();
    await users.delete(ada.id);

    const response = await app.request(`${APP}/api/me`, {}, undefined, asAda);

    expect(response.status).toBe(403);
  });
});

describe("given an admin request without a valid token", () => {
  test.each(["/admin/sandboxes/ada", "/admin/users", "/admin/sandboxes/eve"])(
    "when %s is called with a missing or wrong token, then it is unauthorized",
    async (path) => {
      const { app, calls } = await gateway();

      const missing = await app.request(`${ADMIN}${path}`);
      const wrong = await app.request(`${ADMIN}${path}`, bearer("nope"));

      expect(missing.status).toBe(401);
      expect(await missing.json()).toMatchObject({ error: "unauthorized" });
      expect(wrong.status).toBe(401);
      expect(calls).toEqual([]);
    },
  );

  test("when no admin token is configured, then everything is unauthorized", async () => {
    const { app } = await gateway({ config: { adminToken: undefined } });

    const response = await app.request(`${ADMIN}/admin/users`, bearer(""));

    expect(response.status).toBe(401);
  });
});

describe("given an admin with a valid token", () => {
  test("when they invite a user, then the user signs in to their own sandbox", async () => {
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

  test.each([
    { email: "cy@example.com", sandbox: "app" },
    { email: "cy@example.com", sandbox: "Cy" },
    { email: "cy@example.com", sandbox: "c.y" },
    { email: "not-an-email", sandbox: "cy" },
    { sandbox: "cy" },
  ])("when they invite %j, then it is an invalid request", async (body) => {
    const { app } = await gateway();

    const response = await app.request(`${ADMIN}/admin/users`, json("POST", body));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_request" });
  });

  test.each([
    { email: "ada@example.com", sandbox: "cy" },
    { email: "cy@example.com", sandbox: "bob" },
  ])("when they invite the taken %j, then it is a conflict", async (body) => {
    const { app } = await gateway();

    const response = await app.request(`${ADMIN}/admin/users`, json("POST", body));

    expect(response.status).toBe(409);
  });

  test("when they delete a user, then the sandbox is destroyed and the name retired", async () => {
    const { app, calls, ada } = await gateway();

    const deleted = await app.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}));

    expect(deleted.status).toBe(204);
    expect(calls).toEqual(["ada destroy"]);
    expect((await app.request("https://ada.example.com/")).status).toBe(404);
    const reuse = await app.request(
      `${ADMIN}/admin/users`,
      json("POST", { email: "eve@example.com", sandbox: "ada" }),
    );
    expect(reuse.status).toBe(409);
    const again = await app.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}));
    expect(again.status).toBe(404);
  });

  test("when destroying the sandbox fails, then the user is kept so it can be retried", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { users, ada } = await gateway();
    const down = () => Promise.reject(new Error("down"));
    const broken = createApp(() => ({
      config,
      users,
      fetch: noNetwork,
      font: null,
      sandboxes: {
        get: () => ({ fetch: down, pair: down, status: down, stop: down, destroy: down }),
      },
    }));

    const response = await broken.request(`${ADMIN}/admin/users/${ada.id}`, json("DELETE", {}));

    expect(response.status).toBe(503);
    expect(await users.byId(ada.id)).not.toBeNull();
  });

  test("when they link installations, then each belongs to one user and shows in the list", async () => {
    const { app, users, ada, bob } = await gateway();
    const link = (user: User, body: unknown) =>
      app.request(`${ADMIN}/admin/users/${user.id}/github`, json("PUT", body));

    const first = await link(ada, { installationId: 34, accountLogin: "ada" });
    const second = await link(ada, { installationId: 35, accountLogin: "ada-org" });
    const taken = await link(bob, { installationId: 34 });

    expect([first.status, second.status, taken.status]).toEqual([204, 204, 409]);
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
    expect((await users.installations(bob.id)).map((i) => i.installationId)).toEqual([]);
  });

  test.each([{ installationId: "34" }, { installationId: 0 }])(
    "when they link %j, then it is an invalid request",
    async (body) => {
      const { app, bob } = await gateway();

      const response = await app.request(
        `${ADMIN}/admin/users/${bob.id}/github`,
        json("PUT", body),
      );

      expect(response.status).toBe(400);
    },
  );

  test("when they unlink a user's installations, then all of them are removed", async () => {
    const { app, users, ada } = await gateway();
    await users.claimInstallation(ada.id, 34, "ada");

    const cleared = await app.request(`${ADMIN}/admin/users/${ada.id}/github`, json("DELETE", {}));

    expect(cleared.status).toBe(204);
    expect(await users.installations(ada.id)).toEqual([]);
  });

  test("when they link an installation to a missing user, then it is not found", async () => {
    const { app } = await gateway();

    const response = await app.request(
      `${ADMIN}/admin/users/missing/github`,
      json("PUT", { installationId: 1 }),
    );

    expect(response.status).toBe(404);
  });

  test("when they pair a sandbox, then they get a one-time link on its hostname", async () => {
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

  test("when they check a sandbox, then they see its status", async () => {
    const { app } = await gateway();

    const status = await app.request(`${ADMIN}/admin/sandboxes/bob`, bearer(TOKEN));

    expect(await status.json()).toEqual({
      running: true,
      ready: true,
      version: "2.2.7",
      lastSavedAt: null,
    });
  });

  test("when they stop a sandbox, then it is stopped", async () => {
    const { app, calls } = await gateway();

    const stop = await app.request(`${ADMIN}/admin/sandboxes/bob`, {
      method: "DELETE",
      ...bearer(TOKEN),
    });

    expect(stop.status).toBe(204);
    expect(calls).toEqual(["bob stop"]);
  });

  test.each<[string, RequestInit]>([
    ["/admin/sandboxes/eve", bearer(TOKEN)],
    ["/admin/sandboxes/ada/pair", bearer(TOKEN)],
    ["/admin/users/missing", json("DELETE", {})],
    ["/", {}],
  ])("when they call %s, then it is 404 and no sandbox is touched", async (path, init) => {
    const { app, calls } = await gateway();

    const response = await app.request(`${ADMIN}${path}`, init);

    expect(response.status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("given a sandbox that fails or misbehaves", () => {
  test("when the admin pairs it and it fails, then it is a coded 503 and the cause is only logged", async () => {
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

  test("when it returns a strange pairing code, then the code is encoded and can't move the link", async () => {
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
