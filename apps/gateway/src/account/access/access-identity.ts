import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";

const AccessContextSchema = v.object({ aud: v.string(), getIdentity: v.function() });

const IdentitySchema = v.object({ email: v.pipe(v.string(), v.email(), v.toLowerCase()) });

// https://developers.cloudflare.com/workers/configuration/cloudflare-access/
// TODO(M4): ctx.access is not set on Workers with Static Assets; verify Cf-Access-Jwt-Assertion there.
export async function accessEmail(access: unknown, audience: string | undefined): Promise<string> {
  if (!audience || !v.is(AccessContextSchema, access) || access.aud !== audience) {
    throw new GatewayError(ErrorCode.NotSignedIn);
  }
  const identity = v.safeParse(IdentitySchema, await access.getIdentity());
  if (!identity.success) {
    throw new GatewayError(ErrorCode.NotSignedIn, {
      details: { reason: "identity without email" },
    });
  }
  return identity.output.email;
}
