import { verifyWithJwks } from "hono/jwt";
import type { HonoJsonWebKey } from "hono/utils/jwt/jws";
import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";

const AccessContextSchema = v.object({ aud: v.string(), getIdentity: v.function() });

const Email = v.pipe(v.string(), v.email(), v.toLowerCase());

const IdentitySchema = v.object({ email: Email });

const AssertionSchema = v.object({ email: Email, exp: v.number() });

const JWKS_CACHE_SECONDS = 300;

export interface AccessSettings {
  audience: string | undefined;
  teamDomain: string | undefined;
}

export interface AccessRequest {
  context: unknown;
  assertion: string | undefined;
}

// https://developers.cloudflare.com/workers/configuration/cloudflare-access/
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
export async function accessEmail(
  request: AccessRequest,
  settings: AccessSettings,
  keys?: HonoJsonWebKey[],
): Promise<string> {
  const { audience, teamDomain } = settings;
  if (!audience) {
    throw new GatewayError(ErrorCode.NotSignedIn);
  }
  const { context, assertion } = request;
  if (v.is(AccessContextSchema, context) && context.aud === audience) {
    return identityEmail(await context.getIdentity());
  }
  if (assertion && teamDomain) {
    return assertionEmail(assertion, audience, teamDomain, keys);
  }
  throw new GatewayError(ErrorCode.NotSignedIn);
}

function identityEmail(identity: unknown): string {
  const parsed = v.safeParse(IdentitySchema, identity);
  if (!parsed.success) {
    throw new GatewayError(ErrorCode.NotSignedIn, {
      details: { reason: "identity without email" },
    });
  }
  return parsed.output.email;
}

async function assertionEmail(
  assertion: string,
  audience: string,
  teamDomain: string,
  keys: HonoJsonWebKey[] | undefined,
): Promise<string> {
  const payload = await verifyWithJwks(
    assertion,
    {
      ...(keys ? { keys } : { jwks_uri: `${teamDomain}/cdn-cgi/access/certs` }),
      allowedAlgorithms: ["RS256"],
      verification: { iss: teamDomain, aud: audience },
    },
    { cf: { cacheEverything: true, cacheTtl: JWKS_CACHE_SECONDS } },
  ).catch((cause: unknown) => {
    throw new GatewayError(ErrorCode.NotSignedIn, { cause, details: { reason: "invalid JWT" } });
  });
  const parsed = v.safeParse(AssertionSchema, payload);
  if (!parsed.success) {
    throw new GatewayError(ErrorCode.NotSignedIn, { details: { reason: "JWT without email" } });
  }
  return parsed.output.email;
}
