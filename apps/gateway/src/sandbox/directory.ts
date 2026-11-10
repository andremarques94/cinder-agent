import type { PairingCode } from "./opencode-responses.ts";
import type { OpencodeSandbox } from "./opencode-sandbox.ts";
import type { ServerStatus } from "./server.ts";

export interface SandboxHandle {
  fetch(request: Request): Promise<Response>;
  pair(): Promise<PairingCode>;
  status(): Promise<ServerStatus>;
  stop(): Promise<void>;
}

export interface SandboxDirectory {
  get(name: string): SandboxHandle;
}

export function durableObjectDirectory(
  namespace: DurableObjectNamespace<OpencodeSandbox>,
): SandboxDirectory {
  return {
    get(name) {
      const stub = namespace.getByName(name);
      return {
        fetch: (request) => stub.fetch(toContainerRequest(request)),
        pair: () => stub.pair(),
        status: () => stub.status(),
        stop: () => stub.stop(),
      };
    },
  };
}

function toContainerRequest(request: Request): Request {
  const url = new URL(request.url);
  url.protocol = "http:";
  return new Request(url, request);
}
