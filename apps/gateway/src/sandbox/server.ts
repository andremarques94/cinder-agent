import { OpenCode, type OpenCodeClient } from "@opencode/client";
import * as v from "valibot";

import type { Config } from "@/config";
import { ErrorCode, GatewayError } from "@/errors";
import { describeError, log } from "@/log";

import { ServerInfoSchema, type ServerInfo } from "./opencode-responses.ts";
import { loadOrCreatePassword } from "./password.ts";

const OPENCODE_PORT = 4096;
const OPENCODE_COMMAND = [
  "opencode",
  "serve",
  "--hostname",
  "0.0.0.0",
  "--port",
  `${OPENCODE_PORT}`,
];
const STARTUP_DEADLINE_MS = 60_000;
const READY_POLL_INTERVAL_MS = 500;
const INFO_TIMEOUT_MS = 2_000;

export type ServerConfig = Pick<Config, "instance" | "inactivityTimeoutMs">;

export interface RunningServer {
  port: Fetcher;
  client: OpenCodeClient;
}

export interface ServerStatus {
  running: boolean;
  ready: boolean;
  version: string | null;
}

export class OpencodeServer {
  private ready = false;
  private starting: Promise<RunningServer> | null = null;
  private password: string | null = null;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly config: ServerConfig,
  ) {
    const container = ctx.container;
    if (container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        container.setInactivityTimeout(config.inactivityTimeoutMs),
      );
      this.watch(container);
    }
  }

  async ensureReady(): Promise<RunningServer> {
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
    const container = this.ctx.container;
    if (!container?.running) {
      return { running: false, ready: false, version: null };
    }
    const info = await fetchInfo(await this.connect(container));
    return { running: true, ready: info !== null, version: info?.version ?? null };
  }

  async stop(): Promise<void> {
    if (this.ctx.container?.running) {
      await this.ctx.container.destroy();
    }
    this.ready = false;
    this.starting = null;
  }

  private async start(container: Container): Promise<RunningServer> {
    if (!container.running) {
      this.ready = false;
      container.start({
        image: container.images.opencode,
        entrypoint: OPENCODE_COMMAND,
        instance: this.config.instance,
        env: { OPENCODE_PASSWORD: await this.loadPassword() },
        // TODO(security): outbound allowlist instead (PLAN.md §3.1).
        enableInternet: true,
      });
      await container.setInactivityTimeout(this.config.inactivityTimeoutMs);
      this.watch(container);
    }

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
      .catch((error: unknown) => log.warn("sandbox_exited", describeError(error)))
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
