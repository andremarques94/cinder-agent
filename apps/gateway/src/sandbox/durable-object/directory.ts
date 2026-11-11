import type { PairingCode } from "../container/opencode-responses.ts";
import type { ServerStatus } from "../lifecycle/server.ts";
import type { OpencodeSandbox } from "./opencode-sandbox.ts";

export interface SandboxHandle {
  fetch(request: Request): Promise<Response>;
  pair(): Promise<PairingCode>;
  status(): Promise<ServerStatus>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
}

export interface SandboxDirectory {
  get(userId: string): SandboxHandle;
}

export function durableObjectDirectory(
  namespace: DurableObjectNamespace<OpencodeSandbox>,
): SandboxDirectory {
  return {
    get(userId) {
      const stub = namespace.getByName(userId);
      return {
        fetch: (request) => stub.fetch(toContainerRequest(request)),
        pair: () => stub.pair(),
        status: () => stub.status(),
        stop: () => stub.stop(),
        destroy: () => stub.destroy(),
      };
    },
  };
}

function toContainerRequest(request: Request): Request {
  const url = new URL(request.url);
  url.protocol = "http:";
  return new Request(url, request);
}
