import { DirectoryBackup } from "@cloudflare/sandbox";
import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";

import { loadConfig } from "@/lib/config";
import { ErrorCode, GatewayError, errorResponse } from "@/lib/errors";
import { d1UserStore } from "@/users";

import { WorkspaceBackups } from "../backups/backups.ts";
import { PairingCodeSchema, type PairingCode } from "../container/opencode-responses.ts";
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
    const backups = new WorkspaceBackups(
      new DirectoryBackup(ctx.container, ctx.exports.DirectoryBackupGateway, {
        binding: BACKUP_BINDING,
        prefix: `${BACKUP_PREFIX}${userId}/`,
      }),
      ctx.storage,
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
        identityInstallation: async () => {
          if (!(await users.byId(userId))) {
            throw new GatewayError(ErrorCode.NotFound, { details: { reason: "user deleted" } });
          }
          return (await users.installations(userId))[0]?.installationId ?? null;
        },
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

  async pair(): Promise<PairingCode> {
    this.activity.touch();
    const { client } = await this.server.ensureReady();
    return v.parse(PairingCodeSchema, await client.server.pair());
  }

  status(): Promise<ServerStatus> {
    return this.server.status();
  }

  stop(): Promise<void> {
    return this.server.stop();
  }

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
