import * as v from "valibot";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { Config } from "@/config";
import type { SandboxDirectory, SandboxHandle } from "@/sandbox";

import { createApp } from "./create-app.ts";

const ADMIN = "https://gw.acct.workers.dev";
const TOKEN = "admin-secret";

const config: Config = {
  sandboxDomain: "example.com",
  sandboxes: new Set(["me", "ada"]),
  instance: "standard-1",
  inactivityTimeoutMs: 60_000,
  adminToken: TOKEN,
  github: null,
};

function fakeSandboxes({ failPairing = false, pairingCode = "one-time-code" } = {}) {
  const calls: string[] = [];
  const handle = (name: string): SandboxHandle => ({
    fetch: async (request) => {
      calls.push(`${name} fetch ${new URL(request.url).host}${new URL(request.url).pathname}`);
      return new Response(`sandbox ${name}`);
    },
    pair: async () => {
      calls.push(`${name} pair`);
      if (failPairing) {
        throw new Error("container failed to start");
      }
      return { code: pairingCode, expiresIn: 300 };
    },
    status: async () => ({ running: true, ready: true, version: "2.2.7", lastSavedAt: null }),
    stop: async () => {
      calls.push(`${name} stop`);
    },
  });
  const directory: SandboxDirectory = { get: handle };
  return { directory, calls };
}

function gateway(
  overrides: Partial<Config> = {},
  options: { failPairing?: boolean; pairingCode?: string } = {},
) {
  const { directory, calls } = fakeSandboxes(options);
  const app = createApp(() => ({ config: { ...config, ...overrides }, sandboxes: directory }));
  return { app, calls };
}

const bearer = (token: string) => ({ headers: { authorization: `Bearer ${token}` } });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sandbox hostnames", () => {
  test("go to the sandbox with the same name, unchanged", async () => {
    const { app, calls } = gateway();
    const response = await app.request("https://me.example.com/api/session?x=1");
    expect(await response.text()).toBe("sandbox me");
    expect(calls).toEqual(["me fetch me.example.com/api/session"]);
  });

  test("never reach the admin API, even with a valid token", async () => {
    const { app, calls } = gateway();
    const response = await app.request("https://me.example.com/admin/sandboxes/ada/pair", {
      method: "POST",
      ...bearer(TOKEN),
    });
    expect(await response.text()).toBe("sandbox me");
    expect(calls).toEqual(["me fetch me.example.com/admin/sandboxes/ada/pair"]);
  });

  test("unknown names get 404 and no sandbox is touched", async () => {
    const { app, calls } = gateway();
    const response = await app.request("https://bob.example.com/");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "not_found" });
    expect(calls).toEqual([]);
  });
});

describe("admin API", () => {
  test("rejects a missing or wrong token before anything else", async () => {
    const { app, calls } = gateway();
    const missing = await app.request(`${ADMIN}/admin/sandboxes/me`);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: "unauthorized" });
    const wrong = await app.request(`${ADMIN}/admin/sandboxes/me`, bearer("nope"));
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toMatchObject({ error: "unauthorized" });
    expect((await app.request(`${ADMIN}/admin/sandboxes/bob`)).status).toBe(401);
    expect(calls).toEqual([]);
  });

  test("rejects everything when no admin token is configured", async () => {
    const { app } = gateway({ adminToken: undefined });
    expect((await app.request(`${ADMIN}/admin/sandboxes/me`, bearer(""))).status).toBe(401);
  });

  test("pair returns a one-time link on the sandbox's hostname", async () => {
    const { app, calls } = gateway();
    const response = await app.request(`${ADMIN}/admin/sandboxes/me/pair`, {
      method: "POST",
      ...bearer(TOKEN),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      url: "https://me.example.com/auth/connect/one-time-code",
      server: "https://me.example.com",
      expiresIn: 300,
    });
    expect(calls).toEqual(["me pair"]);
  });

  test("status and stop", async () => {
    const { app, calls } = gateway();
    const status = await app.request(`${ADMIN}/admin/sandboxes/ada`, bearer(TOKEN));
    expect(await status.json()).toEqual({
      running: true,
      ready: true,
      version: "2.2.7",
      lastSavedAt: null,
    });

    const stop = await app.request(`${ADMIN}/admin/sandboxes/ada`, {
      method: "DELETE",
      ...bearer(TOKEN),
    });
    expect(stop.status).toBe(204);
    expect(calls).toEqual(["ada stop"]);
  });

  test("unknown sandboxes, wrong methods and other paths are 404", async () => {
    const { app, calls } = gateway();
    expect((await app.request(`${ADMIN}/admin/sandboxes/bob`, bearer(TOKEN))).status).toBe(404);
    expect((await app.request(`${ADMIN}/admin/sandboxes/me/pair`, bearer(TOKEN))).status).toBe(404);
    expect((await app.request(`${ADMIN}/`)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test("a sandbox that fails gets a coded 503, and the cause is logged, not returned", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = gateway({}, { failPairing: true });
    const response = await app.request(`${ADMIN}/admin/sandboxes/me/pair`, {
      method: "POST",
      ...bearer(TOKEN),
    });
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ error: "sandbox_unavailable" });
    expect(body).not.toContain("container failed to start");
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sandbox_unavailable", sandbox: "me" }),
    );
  });

  test("a strange pairing code is encoded, so it can't change where the link points", async () => {
    const { app } = gateway({}, { pairingCode: "../../evil?x=1#y" });
    const response = await app.request(`${ADMIN}/admin/sandboxes/me/pair`, {
      method: "POST",
      ...bearer(TOKEN),
    });
    const { url } = v.parse(v.object({ url: v.string() }), await response.json());
    expect(url).toBe("https://me.example.com/auth/connect/..%2F..%2Fevil%3Fx%3D1%23y");
    expect(new URL(url).pathname.startsWith("/auth/connect/")).toBe(true);
  });
});
