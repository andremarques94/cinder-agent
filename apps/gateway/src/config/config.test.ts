import { expect, test } from "vite-plus/test";

import { loadConfig } from "./config.ts";

test("loadConfig parses the whole environment", () => {
  expect(
    loadConfig({
      SANDBOX_DOMAIN: "Example.COM",
      SANDBOXES: " me, Ada ,",
      OPENCODE_INSTANCE: "standard-2",
      INACTIVITY_TIMEOUT_MINUTES: "10",
      ADMIN_TOKEN: "secret",
    }),
  ).toEqual({
    sandboxDomain: "example.com",
    sandboxes: new Set(["me", "ada"]),
    instance: "standard-2",
    inactivityTimeoutMs: 600_000,
    adminToken: "secret",
  });
});

test("optional settings fall back to defaults", () => {
  expect(
    loadConfig({
      SANDBOX_DOMAIN: "example.com",
      OPENCODE_INSTANCE: "huge",
      INACTIVITY_TIMEOUT_MINUTES: "0",
      ADMIN_TOKEN: "",
    }),
  ).toMatchObject({
    sandboxes: new Set(),
    instance: "standard-1",
    inactivityTimeoutMs: 30 * 60_000,
    adminToken: undefined,
  });
});

test("a missing domain or an invalid sandbox name is an error, not a silent default", () => {
  expect(() => loadConfig({})).toThrow();
  for (const bad of ["bad name", "a.b", "-x", "x-"]) {
    expect(() => loadConfig({ SANDBOX_DOMAIN: "example.com", SANDBOXES: `me,${bad}` })).toThrow(
      "sandbox names must look like",
    );
  }
});
