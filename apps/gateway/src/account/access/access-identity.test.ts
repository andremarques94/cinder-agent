import { sign } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import { expect, test } from "vite-plus/test";

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

test("ctx.access: returns the lowercased email when the audience matches", async () => {
  const request = { context: access("aud", { email: "Ada@Example.com" }), assertion: undefined };
  expect(await accessEmail(request, settings)).toBe("ada@example.com");
});

test("ctx.access: anything else is not signed in", async () => {
  const cases: [unknown, string | undefined][] = [
    [undefined, "aud"],
    [{}, "aud"],
    [access("other-app", { email: "ada@example.com" }), "aud"],
    [access("aud", { email: "ada@example.com" }), undefined],
    [access("aud", undefined), "aud"],
    [access("aud", { name: "Ada" }), "aud"],
    [access("aud", { email: "not an email" }), "aud"],
  ];
  for (const [context, audience] of cases) {
    await expect(
      accessEmail({ context, assertion: undefined }, { audience, teamDomain: TEAM }),
    ).rejects.toEqual(notSignedIn);
  }
});

test("without ctx.access, a valid Access JWT signs the user in", async () => {
  const { publicKey, privateKey } = await signingKeys();
  const assertion = await sign(
    { email: "Ada@Example.com", aud: ["aud"], iss: TEAM, exp: inAnHour() },
    privateKey,
  );
  expect(await accessEmail({ context: undefined, assertion }, settings, [publicKey])).toBe(
    "ada@example.com",
  );
});

test("ctx.access wins over the JWT header", async () => {
  const { publicKey, privateKey } = await signingKeys();
  const assertion = await sign(
    { email: "bob@example.com", aud: ["aud"], iss: TEAM, exp: inAnHour() },
    privateKey,
  );
  const context = access("aud", { email: "ada@example.com" });
  expect(await accessEmail({ context, assertion }, settings, [publicKey])).toBe("ada@example.com");
});

test("a JWT that is wrong in any way is not signed in", async () => {
  const { publicKey, privateKey } = await signingKeys();
  const other = await signingKeys();
  const claims = { email: "ada@example.com", aud: ["aud"], iss: TEAM, exp: inAnHour() };
  const cases: [string, AccessSettings][] = [
    [await sign({ ...claims, aud: ["other-app"] }, privateKey), settings],
    [await sign({ ...claims, iss: "https://evil.cloudflareaccess.com" }, privateKey), settings],
    [await sign({ ...claims, exp: Math.floor(Date.now() / 1000) - 60 }, privateKey), settings],
    [await sign({ email: "ada@example.com", aud: ["aud"], iss: TEAM }, privateKey), settings],
    [await sign({ ...claims, email: "not an email" }, privateKey), settings],
    [await sign(claims, other.privateKey), settings],
    [await sign(claims, "shared-secret", "HS256"), settings],
    ["not.a.jwt", settings],
    [await sign(claims, privateKey), { audience: "aud", teamDomain: undefined }],
    [await sign(claims, privateKey), { audience: undefined, teamDomain: TEAM }],
  ];
  for (const [assertion, overrides] of cases) {
    await expect(
      accessEmail({ context: undefined, assertion }, overrides, [publicKey]),
    ).rejects.toEqual(notSignedIn);
  }
});
