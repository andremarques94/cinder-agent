import { sign } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import { describe, expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";

import { accessEmail, type AccessSettings } from "./access-identity.ts";

const TEAM = "https://team.cloudflareaccess.com";
const settings: AccessSettings = { audience: "aud", teamDomain: TEAM };

const access = (aud: string, identity: unknown) => ({ aud, getIdentity: async () => identity });
const notSignedIn = expect.objectContaining({ code: ErrorCode.NotSignedIn });

async function signingKeys() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!("publicKey" in pair)) {
    throw new Error("expected a key pair");
  }
  const kid = crypto.randomUUID();
  return {
    publicKey: await exportJwk(pair.publicKey, kid),
    privateKey: await exportJwk(pair.privateKey, kid),
  };
}

async function exportJwk(key: CryptoKey, kid: string): Promise<HonoJsonWebKey> {
  const jwk = await crypto.subtle.exportKey("jwk", key);
  if (jwk instanceof ArrayBuffer) {
    throw new Error("expected a JWK");
  }
  return { ...jwk, kid, alg: "RS256" };
}

const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;
const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600;

const keys = await signingKeys();
const otherKeys = await signingKeys();
const claims = () => ({ email: "Ada@Example.com", aud: ["aud"], iss: TEAM, exp: inAnHour() });

describe("given ctx.access for this application", () => {
  test("when the email is read, then it is lowercased", async () => {
    const request = { context: access("aud", { email: "Ada@Example.com" }), assertion: undefined };

    const email = await accessEmail(request, settings);

    expect(email).toBe("ada@example.com");
  });

  test("when there is also a JWT for someone else, then ctx.access wins", async () => {
    const assertion = await sign({ ...claims(), email: "bob@example.com" }, keys.privateKey);
    const request = { context: access("aud", { email: "ada@example.com" }), assertion };

    const email = await accessEmail(request, settings, [keys.publicKey]);

    expect(email).toBe("ada@example.com");
  });
});

describe("given ctx.access that doesn't sign anyone in", () => {
  test.each<[string, unknown, string | undefined]>([
    ["is missing", undefined, "aud"],
    ["is empty", {}, "aud"],
    ["is for another application", access("other-app", { email: "ada@example.com" }), "aud"],
    [
      "is set but no audience is configured",
      access("aud", { email: "ada@example.com" }),
      undefined,
    ],
    ["has no identity", access("aud", undefined), "aud"],
    ["has no email", access("aud", { name: "Ada" }), "aud"],
    ["has an invalid email", access("aud", { email: "not an email" }), "aud"],
  ])("when it %s, then the user is not signed in", async (_label, context, audience) => {
    const signIn = accessEmail({ context, assertion: undefined }, { audience, teamDomain: TEAM });

    await expect(signIn).rejects.toEqual(notSignedIn);
  });
});

describe("given no ctx.access and an Access JWT", () => {
  test("when the JWT is valid, then it signs the user in", async () => {
    const assertion = await sign(claims(), keys.privateKey);

    const email = await accessEmail({ context: undefined, assertion }, settings, [keys.publicKey]);

    expect(email).toBe("ada@example.com");
  });

  test.each<[string, () => Promise<string>, AccessSettings]>([
    [
      "is for another application",
      () => sign({ ...claims(), aud: ["other"] }, keys.privateKey),
      settings,
    ],
    [
      "has another issuer",
      () => sign({ ...claims(), iss: "https://evil.cloudflareaccess.com" }, keys.privateKey),
      settings,
    ],
    ["has expired", () => sign({ ...claims(), exp: anHourAgo() }, keys.privateKey), settings],
    [
      "has no expiry",
      () => sign({ email: "ada@example.com", aud: ["aud"], iss: TEAM }, keys.privateKey),
      settings,
    ],
    [
      "has an invalid email",
      () => sign({ ...claims(), email: "not an email" }, keys.privateKey),
      settings,
    ],
    ["is signed with another key", () => sign(claims(), otherKeys.privateKey), settings],
    ["is signed with a shared secret", () => sign(claims(), "shared-secret", "HS256"), settings],
    ["is not a JWT", async () => "not.a.jwt", settings],
    [
      "is valid but no team domain is configured",
      () => sign(claims(), keys.privateKey),
      { audience: "aud", teamDomain: undefined },
    ],
    [
      "is valid but no audience is configured",
      () => sign(claims(), keys.privateKey),
      { audience: undefined, teamDomain: TEAM },
    ],
  ])("when it %s, then the user is not signed in", async (_label, makeAssertion, overrides) => {
    const assertion = await makeAssertion();

    const signIn = accessEmail({ context: undefined, assertion }, overrides, [keys.publicKey]);

    await expect(signIn).rejects.toEqual(notSignedIn);
  });
});
