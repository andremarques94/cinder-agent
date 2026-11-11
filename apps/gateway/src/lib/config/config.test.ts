import { describe, expect, test } from "vite-plus/test";

import { loadConfig } from "./config.ts";

const DOMAIN = { SANDBOX_DOMAIN: "example.com" };
const pem = (label: string) => `-----BEGIN ${label}-----\nabc\n-----END ${label}-----`;
const KEY = pem("PRIVATE KEY");
const APP = { ...DOMAIN, GITHUB_APP_ID: "12", GITHUB_APP_PRIVATE_KEY: KEY };
const SIGN_IN = {
  GITHUB_APP_SLUG: "cinder-agent",
  GITHUB_CLIENT_ID: "Iv23li",
  GITHUB_CLIENT_SECRET: "client-secret",
};

describe("given a complete environment", () => {
  test("when it is loaded, then every setting is parsed", () => {
    const env = {
      SANDBOX_DOMAIN: "Example.COM",
      OPENCODE_INSTANCE: "standard-2",
      INACTIVITY_TIMEOUT_MINUTES: "10",
      ADMIN_TOKEN: "secret",
      ACCESS_AUD: "aud-tag",
      ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    };

    const config = loadConfig(env);

    expect(config).toEqual({
      sandboxDomain: "example.com",
      instance: "standard-2",
      inactivityTimeoutMs: 600_000,
      adminToken: "secret",
      accessAud: "aud-tag",
      accessTeamDomain: "https://team.cloudflareaccess.com",
      github: null,
      githubSignIn: null,
    });
  });
});

describe("given invalid optional settings", () => {
  test("when they are loaded, then they fall back to defaults", () => {
    const env = {
      ...DOMAIN,
      OPENCODE_INSTANCE: "huge",
      INACTIVITY_TIMEOUT_MINUTES: "0",
      ADMIN_TOKEN: "",
      ACCESS_AUD: "",
      ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com/",
    };

    const config = loadConfig(env);

    expect(config).toMatchObject({
      instance: "standard-1",
      inactivityTimeoutMs: 30 * 60_000,
      adminToken: undefined,
      accessAud: undefined,
      accessTeamDomain: undefined,
    });
  });

  test.each(["http://team.cloudflareaccess.com", "https://team.example.com", "not a url"])(
    "when the Access team domain is %s, then it is ignored",
    (domain) => {
      const config = loadConfig({ ...DOMAIN, ACCESS_TEAM_DOMAIN: domain });

      expect(config.accessTeamDomain).toBeUndefined();
    },
  );
});

describe("given no sandbox domain", () => {
  test("when it is loaded, then it is an error, not a silent default", () => {
    const load = () => loadConfig({});

    expect(load).toThrow("SANDBOX_DOMAIN");
  });
});

describe("given GitHub App settings", () => {
  test("when there are none, then GitHub is off", () => {
    const config = loadConfig(DOMAIN);

    expect(config.github).toBeNull();
  });

  test("when both are set, then the key's escaped newlines are restored", () => {
    const env = { ...APP, GITHUB_APP_PRIVATE_KEY: KEY.replaceAll("\n", "\\n") };

    const config = loadConfig(env);

    expect(config.github).toEqual({ appId: 12, privateKey: KEY });
  });

  test("when only the ID is set, then it is an error", () => {
    const load = () => loadConfig({ ...DOMAIN, GITHUB_APP_ID: "12" });

    expect(load).toThrow("set both GITHUB_APP_ID");
  });

  test("when the key is PKCS#1, then it is an error", () => {
    const load = () => loadConfig({ ...APP, GITHUB_APP_PRIVATE_KEY: pem("RSA PRIVATE KEY") });

    expect(load).toThrow("PKCS#8");
  });
});

describe("given GitHub sign-in settings", () => {
  test("when there are none, then self-service install is off", () => {
    const config = loadConfig(APP);

    expect(config.githubSignIn).toBeNull();
  });

  test("when all are set, then they are read together", () => {
    const config = loadConfig({ ...APP, ...SIGN_IN });

    expect(config.githubSignIn).toEqual({
      slug: "cinder-agent",
      clientId: "Iv23li",
      clientSecret: "client-secret",
    });
  });

  test("when only some are set, then it is an error", () => {
    const load = () => loadConfig({ ...APP, GITHUB_CLIENT_ID: "Iv23li" });

    expect(load).toThrow("set all of GITHUB_APP_SLUG");
  });

  test("when the slug isn't a slug, then it is an error", () => {
    const load = () => loadConfig({ ...APP, ...SIGN_IN, GITHUB_APP_SLUG: "Not A Slug" });

    expect(load).toThrow("set all of GITHUB_APP_SLUG");
  });

  test("when the App itself isn't set, then it is an error", () => {
    const load = () => loadConfig({ ...DOMAIN, ...SIGN_IN });

    expect(load).toThrow("needs GITHUB_APP_ID");
  });
});
