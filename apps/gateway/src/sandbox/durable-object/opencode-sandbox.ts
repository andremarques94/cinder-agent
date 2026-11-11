import { DirectoryBackup } from "@cloudflare/sandbox";
import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { loadConfig } from "@/lib/config";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";
import { d1UserStore } from "@/users";

import { WorkspaceBackups } from "../backups/backups.ts";
import { PairingCodeSchema, type PairingCode } from "../container/opencode-responses.ts";
import { identityInstallation } from "../github/installation-tokens.ts";
import { sandboxGithub } from "../github/sandbox-github.ts";
import { Activity } from "../lifecycle/activity.ts";
import { OpencodeServer, type ServerPort, type ServerStatus } from "../lifecycle/server.ts";
import { proxyToServer } from "../proxy/proxy.ts";

const BACKUP_BINDING = "BACKUPS";
const BACKUP_PREFIX = "sandboxes/";

export class OpencodeSandbox extends DurableObject<Env> {
  private readonly activity = new Activity();
  private readonly server: OpencodeServer;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const userId = ctx.id.name;
    if (!ctx.container || !userId) {
      throw new GatewayError(ErrorCode.SandboxNotConfigured);
    }
    const prefix = `${BACKUP_PREFIX}${userId}/`;
    const backups = new WorkspaceBackups(
      new DirectoryBackup(ctx.container, ctx.exports.DirectoryBackupGateway, {
        binding: BACKUP_BINDING,
        prefix,
      }),
      ctx.storage,
      env.BACKUPS,
      prefix,
    );
    const users = d1UserStore(env.DB);
    const config = loadConfig(env);
    const container = ctx.container;
    this.server = new OpencodeServer({
      container,
      storage: ctx.storage,
      config,
      backups,
      activity: this.activity,
      github: sandboxGithub({
        config: config.github,
        container,
        outbound: () => ctx.exports.GithubOutbound({ props: { userId } }),
        identityInstallation: () => identityInstallation(users, userId),
      }),
    });
    void ctx.blockConcurrencyWhile(() => this.server.resume());
  }

  override async fetch(request: Request): Promise<Response> {
    this.activity.touch();
    try {
      const { port } = await this.server.ensureReady();
      return await this.proxy(port, request);
    } catch (error) {
      return errorResponse(error);
    }
  }

  override async alarm(): Promise<void> {
    await this.server.checkIdle();
  }

  // fallow-ignore-next-line unused-class-member -- called over Durable Object RPC in directory.ts
  async pair(): Promise<PairingCode> {
    this.activity.touch();
    const { client } = await this.server.ensureReady();
    return v.parse(PairingCodeSchema, await client.server.pair());
  }

  // fallow-ignore-next-line unused-class-member -- called over Durable Object RPC in directory.ts
  status(): Promise<ServerStatus> {
    return this.server.status();
  }

  // fallow-ignore-next-line unused-class-member -- called over Durable Object RPC in directory.ts
  stop(): Promise<void> {
    return this.server.stop();
  }

  // fallow-ignore-next-line unused-class-member -- called over Durable Object RPC in directory.ts
  destroy(): Promise<void> {
    return this.server.destroy();
  }

  private async proxy(port: ServerPort, request: Request): Promise<Response> {
    try {
      return await proxyToServer(port, request, this.activity);
    } catch (cause) {
      this.server.markUnhealthy();
      throw new GatewayError(ErrorCode.SandboxNotResponding, { cause });
    }
  }
}
