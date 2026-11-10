import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { loadConfig } from "@/config";
import { ErrorCode, GatewayError, errorResponse } from "@/errors";

import { PairingCodeSchema, type PairingCode } from "./opencode-responses.ts";
import { proxyToServer } from "./proxy.ts";
import { OpencodeServer, type ServerStatus } from "./server.ts";

export class OpencodeSandbox extends DurableObject<Env> {
  private readonly server: OpencodeServer;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.server = new OpencodeServer(ctx, loadConfig(env));
  }

  override async fetch(request: Request): Promise<Response> {
    try {
      const { port } = await this.server.ensureReady();
      return await this.proxy(port, request);
    } catch (error) {
      return errorResponse(error);
    }
  }

  async pair(): Promise<PairingCode> {
    const { client } = await this.server.ensureReady();
    return v.parse(PairingCodeSchema, await client.server.pair());
  }

  status(): Promise<ServerStatus> {
    return this.server.status();
  }

  stop(): Promise<void> {
    return this.server.stop();
  }

  private async proxy(port: Fetcher, request: Request): Promise<Response> {
    try {
      return await proxyToServer(port, request);
    } catch (cause) {
      this.server.markUnhealthy();
      throw new GatewayError(ErrorCode.SandboxNotResponding, { cause });
    }
  }
}
