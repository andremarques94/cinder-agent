import { expect, test } from "vite-plus/test";

import { loadConfig } from "./config.ts";

test("loadConfig parses the whole environment", () => {
  expect(
    loadConfig({
      SANDBOX_DOMAIN: "Example.COM",
      OPENCODE_INSTANCE: "standard-2",
      INACTIVITY_TIMEOUT_MINUTES: "10",
      ADMIN_TOKEN: "secret",
      ACCESS_AUD: "aud-tag",
    }),
  ).toEqual({
    sandboxDomain: "example.com",
    instance: "standard-2",
    inactivityTimeoutMs: 600_000,
    adminToken: "secret",
    accessAud: "aud-tag",
    github: null,
  });
});

test("optional settings fall back to defaults", () => {
  expect(
    loadConfig({
      SANDBOX_DOMAIN: "example.com",
      OPENCODE_INSTANCE: "huge",
      INACTIVITY_TIMEOUT_MINUTES: "0",
      ADMIN_TOKEN: "",
      ACCESS_AUD: "",
    }),
  ).toMatchObject({
    instance: "standard-1",
    inactivityTimeoutMs: 30 * 60_000,
    adminToken: undefined,
    accessAud: undefined,
  });
});

test("a missing domain is an error, not a silent default", () => {
  expect(() => loadConfig({})).toThrow();
});

const pem = (label: string) => `-----BEGIN ${label}-----\nabc\n-----END ${label}-----`;
const KEY = pem("PRIVATE KEY");

test("GitHub App settings are read together, with escaped newlines in the key", () => {
  const env = { SANDBOX_DOMAIN: "example.com" };
  expect(loadConfig(env).github).toBeNull();
  expect(
    loadConfig({
      ...env,
      GITHUB_APP_ID: "12",
      GITHUB_APP_PRIVATE_KEY: KEY.replaceAll("\n", "\\n"),
    }).github,
  ).toEqual({ appId: 12, privateKey: KEY });
});

test("partial GitHub App settings or a PKCS#1 key are an error", () => {
  const env = { SANDBOX_DOMAIN: "example.com", GITHUB_APP_ID: "12" };
  expect(() => loadConfig(env)).toThrow("set both GITHUB_APP_ID");
  expect(() => loadConfig({ ...env, GITHUB_APP_PRIVATE_KEY: pem("RSA PRIVATE KEY") })).toThrow(
    "PKCS#8",
  );
});
