import { describe, expect, test, vi } from "vite-plus/test";

import { ErrorCode, GatewayError } from "@/lib/errors";

import type { SavedBackup } from "../backups/backups.ts";
import { Command } from "../container/layout.ts";
import {
  OpencodeServer,
  type SandboxContainer,
  type ServerDeps,
  type ServerPort,
  type ServerStorage,
} from "./server.ts";

const SAVED: SavedBackup = {
  savedAt: 1_000,
  record: { id: "b1", dir: "/persist", size: 10, sha256: "0".repeat(64), format: "tar+zstd/1" },
};

class Gate {
  private readonly opened = Promise.withResolvers<void>();
  waiting = false;

  async pass(): Promise<void> {
    this.waiting = true;
    await this.opened.promise;
  }

  open(): void {
    this.opened.resolve();
  }
}

const OPEN_GATE = {
  pass: async () => {},
};

type Gates = Partial<Record<"identity" | "restore" | "health", Gate>>;

class FakeContainer implements SandboxContainer {
  running = false;
  readonly images = { opencode: "opencode" };
  starts = 0;
  healthChecks = 0;
  readonly exitCodes = { pause: 0, resume: 0 };
  private marker = false;
  private exited = Promise.withResolvers<void>();

  constructor(
    private readonly events: string[],
    private readonly gates: Gates,
  ) {}

  start(): void {
    this.events.push("container started");
    this.starts++;
    this.running = true;
    this.marker = false;
    this.exited = Promise.withResolvers<void>();
  }

  monitor(): Promise<void> {
    return this.exited.promise;
  }

  async destroy(): Promise<void> {
    this.events.push("container destroyed");
    this.running = false;
    this.exited.resolve();
  }

  getTcpPort(): ServerPort {
    return {
      fetch: async () => {
        this.healthChecks++;
        await (this.gates.health ?? OPEN_GATE).pass();
        return Response.json({ version: "2.2.7" });
      },
    };
  }

  async setInactivityTimeout(): Promise<void> {}

  async exec(command: string[]): Promise<{ exitCode: Promise<number> }> {
    return { exitCode: Promise.resolve(this.run(command.join(" "))) };
  }

  private run(command: string): number {
    switch (command) {
      case Command.isReady.join(" "):
        return this.marker ? 0 : 1;
      case Command.markReady.join(" "):
        this.marker = true;
        return 0;
      case Command.pauseOpencode.join(" "):
        this.events.push(this.exitCodes.pause === 0 ? "paused" : "pause failed");
        return this.exitCodes.pause;
      case Command.resumeOpencode.join(" "):
        this.events.push(this.exitCodes.resume === 0 ? "resumed" : "resume failed");
        return this.exitCodes.resume;
      default:
        return 0;
    }
  }
}

function memoryStorage(): ServerStorage {
  const values = new Map<string, unknown>();
  let alarm: number | null = null;
  return {
    get: async (key) => values.get(key),
    put: async (key, value) => {
      values.set(key, value);
    },
    getAlarm: async () => alarm,
    setAlarm: async (time) => {
      alarm = time;
    },
    deleteAlarm: async () => {
      alarm = null;
    },
    deleteAll: async () => {
      values.clear();
    },
  };
}

function setup({ gates = {}, idle = false }: { gates?: Gates; idle?: boolean } = {}) {
  const events: string[] = [];
  const container = new FakeContainer(events, gates);
  const backups: ServerDeps["backups"] = {
    latest: async () => null,
    restoreLatest: async () => {
      await (gates.restore ?? OPEN_GATE).pass();
      events.push("restored");
    },
    save: async () => {
      events.push("saved");
      return SAVED;
    },
    deleteLatest: async () => {
      events.push("backups deleted");
    },
  };
  const server = new OpencodeServer({
    container,
    storage: memoryStorage(),
    config: { instance: "standard-1", inactivityTimeoutMs: 30 * 60_000 },
    backups,
    activity: { isIdle: () => idle },
    github: {
      intercept: async () => {
        events.push("github intercepted");
      },
      identity: async () => {
        await (gates.identity ?? OPEN_GATE).pass();
        return null;
      },
    },
    wait: async () => {},
  });
  return { server, container, events, backups };
}

async function reached(gate: Gate): Promise<void> {
  await vi.waitFor(() => {
    expect(gate.waiting).toBe(true);
  });
}

describe("given a stopped sandbox", () => {
  test("when two requests arrive at once, then one container starts and both get the server", async () => {
    const { server, container } = setup();

    const [first, second] = await Promise.all([server.ensureReady(), server.ensureReady()]);

    expect(container.starts).toBe(1);
    expect(first.port).toBe(second.port);
  });

  test("when it starts, then GitHub is intercepted before the container starts and restore runs before the ready marker", async () => {
    const { server, events } = setup();

    await server.ensureReady();

    expect(events).toEqual(["github intercepted", "container started", "restored"]);
  });

  test.each(["identity", "restore", "health"] as const)(
    "when stop is called while the start waits for %s, then the stop saves and destroys the container after the start",
    async (step) => {
      const gate = new Gate();
      const { server, container, events } = setup({ gates: { [step]: gate } });
      const start = server.ensureReady();
      await reached(gate);

      const stop = server.stop();
      gate.open();
      await start;
      await stop;

      expect(container.running).toBe(false);
      expect(events.slice(-3)).toEqual(["paused", "saved", "container destroyed"]);
    },
  );

  test("when the restore fails, then the start fails and the next request restores again", async () => {
    const { server, backups, events } = setup();
    vi.spyOn(backups, "restoreLatest").mockRejectedValueOnce(new Error("R2 unavailable"));

    const failed = server.ensureReady();
    await expect(failed).rejects.toEqual(new GatewayError(ErrorCode.SandboxRestoreFailed));
    await server.ensureReady();

    expect(events).toEqual(["github intercepted", "container started", "restored"]);
  });
});

describe("given a running sandbox", () => {
  test("when a request arrives during a stop, then a new container starts after the stop", async () => {
    const { server, container, events } = setup();
    await server.ensureReady();
    events.length = 0;

    const stop = server.stop();
    const request = server.ensureReady();
    await stop;
    await request;

    expect(container.running).toBe(true);
    expect(events).toEqual([
      "paused",
      "saved",
      "container destroyed",
      "github intercepted",
      "container started",
      "restored",
    ]);
  });

  test("when stop is called twice at once, then it saves once", async () => {
    const { server, events } = setup();
    await server.ensureReady();
    events.length = 0;

    await Promise.all([server.stop(), server.stop()]);

    expect(events).toEqual(["paused", "saved", "container destroyed"]);
  });

  test("when it is idle, then the idle check saves and stops it", async () => {
    const { server, container, events } = setup({ idle: true });
    await server.ensureReady();

    await server.checkIdle();

    expect(container.running).toBe(false);
    expect(events.at(-2)).toBe("saved");
  });

  test("when it is destroyed, then the container stops and its backups are deleted", async () => {
    const { server, container, events } = setup();
    await server.ensureReady();
    events.length = 0;

    await server.destroy();

    expect(container.running).toBe(false);
    expect(events).toEqual(["container destroyed", "backups deleted"]);
  });
});

describe("given a sandbox that is starting", () => {
  test("when the idle check runs, then it doesn't stop the sandbox", async () => {
    const gate = new Gate();
    const { server, container } = setup({ gates: { health: gate }, idle: true });
    const start = server.ensureReady();
    await reached(gate);

    await server.checkIdle();
    gate.open();
    await start;

    expect(container.running).toBe(true);
  });

  test("when it is destroyed, then the destroy runs after the start and the container ends stopped", async () => {
    const gate = new Gate();
    const { server, container, events } = setup({ gates: { identity: gate } });
    const start = server.ensureReady();
    await reached(gate);

    const destroy = server.destroy();
    gate.open();
    await start;
    await destroy;

    expect(container.running).toBe(false);
    expect(events.slice(-2)).toEqual(["container destroyed", "backups deleted"]);
  });
});

describe("given a running sandbox that can't be paused", () => {
  test("when it is stopped, then the stop fails, nothing is saved and the container keeps running", async () => {
    const { server, container, events } = setup();
    await server.ensureReady();
    container.exitCodes.pause = 1;
    events.length = 0;

    const stop = server.stop();

    await expect(stop).rejects.toMatchObject({
      code: ErrorCode.SandboxSaveFailed,
      details: { step: "pause" },
    });
    expect(events).toEqual(["pause failed", "resumed"]);
    expect(container.running).toBe(true);
  });

  test("when it is idle, then the idle check keeps it running and checks again later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, container, events } = setup({ idle: true });
    await server.ensureReady();
    container.exitCodes.pause = 1;

    await server.checkIdle();

    expect(container.running).toBe(true);
    expect(events).not.toContain("saved");
  });

  test("when resuming fails too, then it is logged and the next request checks its health", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, container } = setup();
    await server.ensureReady();
    container.exitCodes.pause = 1;
    container.exitCodes.resume = 1;
    const health = vi.spyOn(container, "getTcpPort");

    await expect(server.stop()).rejects.toMatchObject({ code: ErrorCode.SandboxSaveFailed });
    await server.ensureReady();

    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sandbox_resume_failed" }),
    );
    expect(health).toHaveBeenCalled();
  });
});

describe("given a running sandbox whose backup fails", () => {
  test("when it is stopped, then OpenCode is resumed and the container keeps running", async () => {
    const { server, container, backups, events } = setup();
    await server.ensureReady();
    vi.spyOn(backups, "save").mockRejectedValueOnce(new Error("R2 unavailable"));
    events.length = 0;

    const stop = server.stop();

    await expect(stop).rejects.toMatchObject({
      code: ErrorCode.SandboxSaveFailed,
      details: { step: "save" },
    });
    expect(events).toEqual(["paused", "resumed"]);
    expect(container.running).toBe(true);
  });
});
