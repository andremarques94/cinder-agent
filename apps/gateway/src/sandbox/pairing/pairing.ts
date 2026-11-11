import { ErrorCode, GatewayError } from "@/lib/errors";

import type { SandboxHandle } from "../durable-object/directory.ts";
import { sandboxOrigin } from "../hostnames.ts";

interface PairingLink {
  url: string;
  server: string;
  expiresIn: number;
}

export async function callSandbox<T>(sandbox: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (cause) {
    throw new GatewayError(ErrorCode.SandboxUnavailable, { cause, details: { sandbox } });
  }
}

export async function pairingLink(
  handle: SandboxHandle,
  sandbox: string,
  sandboxDomain: string,
  requestUrl: URL,
): Promise<PairingLink> {
  const pairing = await callSandbox(sandbox, () => handle.pair());
  const server = sandboxOrigin(sandbox, sandboxDomain, requestUrl);
  return {
    url: new URL(`/auth/connect/${encodeURIComponent(pairing.code)}`, server).href,
    server,
    expiresIn: pairing.expiresIn,
  };
}
