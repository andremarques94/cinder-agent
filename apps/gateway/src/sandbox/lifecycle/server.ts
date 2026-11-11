import { OpenCode, type OpenCodeClient } from "@opencode/client";
import * as v from "valibot";

import type { Config } from "@/lib/config";
import { ErrorCode, GatewayError } from "@/lib/errors";
import { describeError, log } from "@/lib/log";

import type { WorkspaceBackups } from "../backups/backups.ts";
import { Command, OPENCODE_PORT, containerEnv } from "../container/layout.ts";
import { ServerInfoSchema, type ServerInfo } from "../container/opencode-responses.ts";
import type { GitIdentity } from "../github/github-app.ts";
import type { SandboxGithub } from "../github/sandbox-github.ts";
import type { Activity } from "./activity.ts";
import { loadOrCreatePassword, type PasswordStore } from "./password.ts";
import { Transitions } from "./transitions.ts";

const STARTUP_DEADLINE_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;
const INFO_TIMEOUT_MS = 2_000;
const IDLE_CHECK_INTERVAL_MS = 60_000;
const DELETED_KEY = "deleted-at";
// https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/#delete
const DELETE_BATCH = 128;

export type ServerConfig = Pick<Config, "instance" | "inactivityTimeoutMs">;

export type ServerPort = Pick<Fetcher, "fetch">;

export interface RunningServer {
  port: ServerPort;
  client: OpenCodeClient;
}

export interface SandboxContainer {
  readonly running: boolean;
  readonly images: Record<string, string>;
  start(options: ContainerStartupOptions): void;
  monitor(): Promise<void>;
  destroy(): Promise<void>;
  getTcpPort(port: number): ServerPort;
  setInactivityTimeout(durationMs: number): Promise<void>;
  exec(command: string[], options: ContainerExecOptions): Promise<Pick<ExecProcess, "exitCode">>;
}

export interface ServerStorage extends PasswordStore {
  getAlarm(): Promise<number | null>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
  list(): Promise<Map<string, unknown>>;
  delete(keys: string[]): Promise<number>;
}

export interface ServerDeps {
  container: SandboxContainer;
  storage: ServerStorage;
  config: ServerConfig;
  backups: Pick<WorkspaceBackups, "latest" | "restoreLatest" | "save" | "deleteLatest">;
  activity: Pick<Activity, "isIdle">;
  github: SandboxGithub | null;
  wait?: (ms: number) => Promise<void>;
}

interface TransitionResults extends Record<string, unknown> {
  start: RunningServer;
  stop: undefined;
  destroy: undefined;
}

export interface ServerStatus {
  running: boolean;
  ready: boolean;
  version: string | null;
  lastSavedAt: string | null;
}

export class OpencodeServer {
  private readonly container: SandboxContainer;
  private readonly storage: ServerStorage;
  private readonly config: ServerConfig;
  private readonly backups: ServerDeps["backups"];
  private readonly activity: ServerDeps["activity"];
  private readonly github: SandboxGithub | null;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly transitions = new Transitions<TransitionResults>();
  private ready = false;
  private password: string | null = null;
  private destroying = false;
  private deleted = false;

  constructor(deps: ServerDeps) {
    this.container = deps.container;
    this.storage = deps.storage;
    this.config = deps.config;
    this.backups = deps.backups;
    this.activity = deps.activity;
    this.github = deps.github;
    this.wait = deps.wait ?? ((ms) => scheduler.wait(ms));
  }

  async resume(): Promise<void> {
    if (!this.container.running) {
      return;
    }
    this.watch();
    await this.container.setInactivityTimeout(this.safetyTimeoutMs());
    await this.github?.intercept();
  }

  async ensureReady(): Promise<RunningServer> {
    if (!this.transitions.busy && this.container.running && this.ready) {
      return this.connect();
    }
    return this.transitions.run("start", () => this.startOnce());
  }

  markUnhealthy(): void {
    this.ready = false;
  }

  async status(): Promise<ServerStatus> {
    const lastSavedAt = await this.lastSavedAt();
    if (!this.container.running) {
      return { running: false, ready: false, version: null, lastSavedAt };
    }
    const info = await fetchInfo(await this.connect());
    return { running: true, ready: info !== null, version: info?.version ?? null, lastSavedAt };
  }

  stop(): Promise<void> {
    return this.transitions.run("stop", () => this.saveThenDestroy("admin"));
  }

  destroy(): Promise<void> {
    return this.transitions.run("destroy", () => this.destroyNow());
  }

  async checkIdle(): Promise<void> {
    if (!this.container.running) {
      return;
    }
    if (!this.transitions.busy && this.activity.isIdle(this.config.inactivityTimeoutMs)) {
      try {
        await this.transitions.run("stop", () => this.saveThenDestroy("idle"));
        return;
      } catch (error) {
        log.error("sandbox_idle_save_failed", describeError(error));
      }
    }
    await this.container.setInactivityTimeout(this.safetyTimeoutMs());
    await this.scheduleIdleCheck();
  }

  // The deleted mark is written before teardown and never removed, so no start queued behind
  // this one, and none after the Durable Object restarts mid-cleanup, can bring the container
  // back.
  private async destroyNow(): Promise<undefined> {
    this.deleted = true;
    if ((await this.storage.get(DELETED_KEY)) === undefined) {
      await this.storage.put(DELETED_KEY, `${Date.now()}`);
    }
    this.ready = false;
    if (this.container.running) {
      this.destroying = true;
      await this.container.destroy();
    }
    await this.backups.deleteLatest();
    await this.storage.deleteAlarm();
    await this.deleteAllButDeletedMark();
    this.password = null;
    log.info("sandbox_destroyed", {});
    return undefined;
  }

  private async deleteAllButDeletedMark(): Promise<void> {
    const keys = [...(await this.storage.list()).keys()].filter((key) => key !== DELETED_KEY);
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      await this.storage.delete(keys.slice(start, start + DELETE_BATCH));
    }
  }

  private async isDeleted(): Promise<boolean> {
    this.deleted ||= (await this.storage.get(DELETED_KEY)) !== undefined;
    return this.deleted;
  }

  // https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-container-api/
  private async startOnce(): Promise<RunningServer> {
    if (await this.isDeleted()) {
      throw new GatewayError(ErrorCode.NotFound, { details: { reason: "sandbox deleted" } });
    }
    if (this.container.running && this.ready) {
      return this.connect();
    }
    try {
      return await this.start();
    } catch (cause) {
      throw cause instanceof GatewayError
        ? cause
        : new GatewayError(ErrorCode.SandboxStartFailed, { cause });
    }
  }

  private async start(): Promise<RunningServer> {
    const container = this.container;
    if (!container.running) {
      this.ready = false;
      this.destroying = false;
      const github = await this.connectGithub();
      container.start({
        image: container.images.opencode,
        instance: this.config.instance,
        env: containerEnv(await this.loadPassword(), github),
        // TODO(security): outbound allowlist instead of open internet access.
        enableInternet: true,
      });
      await container.setInactivityTimeout(this.safetyTimeoutMs());
      this.watch();
    }

    if (!(await this.succeeds(Command.isReady))) {
      try {
        await this.backups.restoreLatest();
      } catch (cause) {
        throw new GatewayError(ErrorCode.SandboxRestoreFailed, { cause });
      }
      await this.run(Command.markReady);
    }
    await this.scheduleIdleCheck();

    const server = await this.connect();
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
      await this.wait(READY_POLL_INTERVAL_MS);
    }
    throw new GatewayError(ErrorCode.SandboxStartTimeout, {
      details: { timeoutMs: STARTUP_DEADLINE_MS },
    });
  }

  private async connectGithub(): Promise<{ identity: GitIdentity | null } | null> {
    if (!this.github) {
      return null;
    }
    await this.github.intercept();
    return { identity: await this.github.identity() };
  }

  private async saveThenDestroy(reason: string): Promise<undefined> {
    const container = this.container;
    if (!container.running) {
      this.ready = false;
      return undefined;
    }
    const restored = this.ready || (await this.succeeds(Command.isReady));
    if (restored) {
      // Without a pause the archive could hold half-written files, so a failed pause keeps the
      // container running and the previous backup as the restore point.
      const paused = await this.attempt(Command.pauseOpencode);
      if (paused !== true) {
        await this.resumeOpencode(reason);
        throw new GatewayError(ErrorCode.SandboxSaveFailed, {
          ...(paused === false ? {} : { cause: paused.error }),
          details: { reason, step: "pause" },
        });
      }
      try {
        const saved = await this.backups.save();
        log.info("sandbox_saved", { reason, bytes: saved.record.size });
      } catch (cause) {
        await this.resumeOpencode(reason);
        throw new GatewayError(ErrorCode.SandboxSaveFailed, {
          cause,
          details: { reason, step: "save" },
        });
      }
    }
    this.ready = false;
    log.info("sandbox_stopped", { reason, saved: restored });
    this.destroying = true;
    await container.destroy();
    return undefined;
  }

  private async resumeOpencode(reason: string): Promise<void> {
    const resumed = await this.attempt(Command.resumeOpencode);
    if (resumed !== true) {
      this.ready = false;
      log.error("sandbox_resume_failed", {
        reason,
        ...(resumed === false ? {} : describeError(resumed.error)),
      });
    }
  }

  private async attempt(command: readonly string[]): Promise<boolean | { error: unknown }> {
    try {
      return await this.succeeds(command);
    } catch (error) {
      return { error };
    }
  }

  private async scheduleIdleCheck(): Promise<void> {
    if ((await this.storage.getAlarm()) === null) {
      await this.storage.setAlarm(Date.now() + IDLE_CHECK_INTERVAL_MS);
    }
  }

  private safetyTimeoutMs(): number {
    return this.config.inactivityTimeoutMs + 5 * IDLE_CHECK_INTERVAL_MS;
  }

  private async succeeds(command: readonly string[]): Promise<boolean> {
    const process = await this.container.exec([...command], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return (await process.exitCode) === 0;
  }

  private async run(command: readonly string[]): Promise<void> {
    if (!(await this.succeeds(command))) {
      throw new Error(`command failed: ${command.join(" ")}`);
    }
  }

  private async connect(): Promise<RunningServer> {
    const port = this.container.getTcpPort(OPENCODE_PORT);
    const client = OpenCode.make({
      baseUrl: "http://container",
      fetch: (input, init) => port.fetch(input, init),
      headers: { authorization: `Basic ${btoa(`opencode:${await this.loadPassword()}`)}` },
    });
    return { port, client };
  }

  private watch(): void {
    void this.watchUntilExit();
  }

  private async watchUntilExit(): Promise<void> {
    try {
      await this.container.monitor();
    } catch (error) {
      if (!this.destroying) {
        log.warn("sandbox_exited", describeError(error));
      }
    } finally {
      this.ready = false;
    }
  }

  private async lastSavedAt(): Promise<string | null> {
    try {
      const latest = await this.backups.latest();
      return latest ? new Date(latest.savedAt).toISOString() : null;
    } catch {
      return null;
    }
  }

  private async loadPassword(): Promise<string> {
    this.password ??= await loadOrCreatePassword(this.storage);
    return this.password;
  }
}

async function fetchInfo({ client }: RunningServer): Promise<ServerInfo | null> {
  try {
    const info = await client.server.info({ signal: AbortSignal.timeout(INFO_TIMEOUT_MS) });
    const parsed = v.safeParse(ServerInfoSchema, info);
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}
