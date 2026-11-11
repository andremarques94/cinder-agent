import { OpenCode, type OpenCodeClient } from "@opencode/client";
import * as v from "valibot";

import type { Config } from "@/config";
import { ErrorCode, GatewayError } from "@/errors";
import { describeError, log } from "@/log";

import type { Activity } from "./activity.ts";
import type { WorkspaceBackups } from "./backups.ts";
import { Command, OPENCODE_PORT, containerEnv } from "./layout.ts";
import { ServerInfoSchema, type ServerInfo } from "./opencode-responses.ts";
import { loadOrCreatePassword } from "./password.ts";

const STARTUP_DEADLINE_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;
const INFO_TIMEOUT_MS = 2_000;
const IDLE_CHECK_INTERVAL_MS = 60_000;

export type ServerConfig = Pick<Config, "instance" | "inactivityTimeoutMs">;

export interface RunningServer {
  port: Fetcher;
  client: OpenCodeClient;
}

export interface ServerStatus {
  running: boolean;
  ready: boolean;
  version: string | null;
  lastSavedAt: string | null;
}

export class OpencodeServer {
  private ready = false;
  private starting: Promise<RunningServer> | null = null;
  private stopping: Promise<void> | null = null;
  private password: string | null = null;
  private destroying = false;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly config: ServerConfig,
    private readonly backups: WorkspaceBackups,
    private readonly activity: Activity,
  ) {
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() => container.setInactivityTimeout(this.safetyTimeoutMs()));
      this.watch(container);
    }
  }

  async ensureReady(): Promise<RunningServer> {
    await this.stopping?.catch(() => {});
    const container = this.container();
    if (container.running && this.ready) {
      return this.connect(container);
    }
    // https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-container-api/
    this.starting ??= this.start(container)
      .catch((cause: unknown) => {
        throw cause instanceof GatewayError
          ? cause
          : new GatewayError(ErrorCode.SandboxStartFailed, { cause });
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  markUnhealthy(): void {
    this.ready = false;
  }

  async status(): Promise<ServerStatus> {
    const latest = await this.backups.latest().catch(() => null);
    const lastSavedAt = latest ? new Date(latest.savedAt).toISOString() : null;
    const container = this.ctx.container;
    if (!container?.running) {
      return { running: false, ready: false, version: null, lastSavedAt };
    }
    const info = await fetchInfo(await this.connect(container));
    return { running: true, ready: info !== null, version: info?.version ?? null, lastSavedAt };
  }

  stop(): Promise<void> {
    return this.saveAndStop("admin");
  }

  async checkIdle(): Promise<void> {
    const container = this.ctx.container;
    if (!container?.running) {
      return;
    }
    const idle =
      this.starting === null &&
      this.stopping === null &&
      this.activity.isIdle(this.config.inactivityTimeoutMs);
    if (idle) {
      try {
        await this.saveAndStop("idle");
        return;
      } catch (error) {
        log.error("sandbox_idle_save_failed", describeError(error));
      }
    }
    await container.setInactivityTimeout(this.safetyTimeoutMs());
    await this.scheduleIdleCheck();
  }

  private async start(container: Container): Promise<RunningServer> {
    if (!container.running) {
      this.ready = false;
      this.destroying = false;
      container.start({
        image: container.images.opencode,
        instance: this.config.instance,
        env: containerEnv(await this.loadPassword()),
        // TODO(security): outbound allowlist instead (PLAN.md §3.1).
        enableInternet: true,
      });
      await container.setInactivityTimeout(this.safetyTimeoutMs());
      this.watch(container);
    }

    if (!(await this.succeeds(container, Command.isReady))) {
      await this.backups.restoreLatest().catch((cause: unknown) => {
        throw new GatewayError(ErrorCode.SandboxRestoreFailed, { cause });
      });
      await this.run(container, Command.markReady);
    }
    await this.scheduleIdleCheck();

    const server = await this.connect(container);
    const deadline = Date.now() + STARTUP_DEADLINE_MS;
    while (Date.now() < deadline) {
      if (!container.running) {
        throw new GatewayError(ErrorCode.SandboxStartFailed, {
          details: { reason: "container stopped during startup" },
        });
      }
      if (await fetchInfo(server)) {
        this.ready = true;
        return server;
      }
      await scheduler.wait(READY_POLL_INTERVAL_MS);
    }
    throw new GatewayError(ErrorCode.SandboxStartTimeout, {
      details: { timeoutMs: STARTUP_DEADLINE_MS },
    });
  }

  private saveAndStop(reason: string): Promise<void> {
    this.stopping ??= this.saveThenDestroy(reason).finally(() => {
      this.stopping = null;
    });
    return this.stopping;
  }

  private async saveThenDestroy(reason: string): Promise<void> {
    const container = this.ctx.container;
    if (!container?.running) {
      this.ready = false;
      return;
    }
    const restored = this.ready || (await this.succeeds(container, Command.isReady));
    if (restored) {
      await this.succeeds(container, Command.pauseOpencode);
      try {
        const saved = await this.backups.save();
        log.info("sandbox_saved", { reason, bytes: saved.record.size });
      } catch (cause) {
        await this.succeeds(container, Command.resumeOpencode);
        throw new GatewayError(ErrorCode.SandboxSaveFailed, { cause, details: { reason } });
      }
    }
    this.ready = false;
    log.info("sandbox_stopped", { reason, saved: restored });
    this.destroying = true;
    await container.destroy();
  }

  private async scheduleIdleCheck(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_CHECK_INTERVAL_MS);
    }
  }

  private safetyTimeoutMs(): number {
    return this.config.inactivityTimeoutMs + 5 * IDLE_CHECK_INTERVAL_MS;
  }

  private async succeeds(container: Container, command: readonly string[]): Promise<boolean> {
    const process = await container.exec([...command], { stdout: "ignore", stderr: "ignore" });
    return (await process.exitCode) === 0;
  }

  private async run(container: Container, command: readonly string[]): Promise<void> {
    if (!(await this.succeeds(container, command))) {
      throw new Error(`command failed: ${command.join(" ")}`);
    }
  }

  private async connect(container: Container): Promise<RunningServer> {
    const port = container.getTcpPort(OPENCODE_PORT);
    const client = OpenCode.make({
      baseUrl: "http://container",
      fetch: (input, init) => port.fetch(input, init),
      headers: { authorization: `Basic ${btoa(`opencode:${await this.loadPassword()}`)}` },
    });
    return { port, client };
  }

  private watch(container: Container): void {
    container
      .monitor()
      .catch((error: unknown) => {
        if (!this.destroying) {
          log.warn("sandbox_exited", describeError(error));
        }
      })
      .finally(() => {
        this.ready = false;
      });
  }

  private async loadPassword(): Promise<string> {
    this.password ??= await loadOrCreatePassword(this.ctx.storage);
    return this.password;
  }

  private container(): Container {
    const container = this.ctx.container;
    if (!container) {
      throw new GatewayError(ErrorCode.SandboxNotConfigured);
    }
    return container;
  }
}

async function fetchInfo({ client }: RunningServer): Promise<ServerInfo | null> {
  const info = await client.server
    .info({ signal: AbortSignal.timeout(INFO_TIMEOUT_MS) })
    .catch(() => null);
  const parsed = v.safeParse(ServerInfoSchema, info);
  return parsed.success ? parsed.output : null;
}
