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
  monitors = 0;
  timeouts: number[] = [];
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
    this.monitors++;
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

  async setInactivityTimeout(durationMs: number): Promise<void> {
    this.timeouts.push(durationMs);
  }

  alreadyRunning(): void {
    this.running = true;
    this.marker = true;
  }

  readonly rejects = new Set<string>();

  async exec(command: string[]): Promise<{ exitCode: Promise<number> }> {
    const joined = command.join(" ");
    if (this.rejects.has(joined)) {
      this.events.push(`${command[1]} rejected`);
      throw new Error("container connection lost");
    }
    return { exitCode: Promise.resolve(this.run(joined)) };
  }

  private run(command: string): number {
    switch (command) {
      case Command.isReady.join(" "):
        return this.marker ? 0 : 1;
      case Command.markReady.join(" "):
        this.events.push("marked ready");
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
    list: async () => new Map(values),
    delete: async (keys) => {
      let deleted = 0;
      for (const key of keys) {
        deleted += values.delete(key) ? 1 : 0;
      }
      return deleted;
    },
  };
}

interface Setup {
  gates?: Gates;
  idle?: boolean;
  storage?: ServerStorage;
}

function setup({ gates = {}, idle = false, storage = memoryStorage() }: Setup = {}) {
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
    storage,
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
  return { server, container, events, backups, storage };
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

    expect(events).toEqual(["github intercepted", "container started", "restored", "marked ready"]);
  });

  test("when the restore is still running, then the ready marker isn't written yet", async () => {
    const gate = new Gate();
    const { server, events } = setup({ gates: { restore: gate } });
    const start = server.ensureReady();
    await reached(gate);

    const beforeRestore = [...events];
    gate.open();
    await start;

    expect(beforeRestore).not.toContain("marked ready");
    expect(events.slice(-2)).toEqual(["restored", "marked ready"]);
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

    expect(events).toEqual(["github intercepted", "container started", "restored", "marked ready"]);
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
      "marked ready",
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

describe("given a destroyed sandbox", () => {
  test("when a request arrives, then it is refused and no container starts", async () => {
    const { server, container } = setup();
    await server.destroy();

    const request = server.ensureReady();

    await expect(request).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(container.starts).toBe(0);
  });

  test("when a request was queued behind the destroy, then it doesn't start the container", async () => {
    const { server, container } = setup();
    await server.ensureReady();

    const destroy = server.destroy();
    const request = server.ensureReady();
    await destroy;

    await expect(request).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(container.running).toBe(false);
  });

  test("when writing the deleted mark fails, then a later request is refused instead of reaching the running server", async () => {
    const storage = memoryStorage();
    const { server, container } = setup({ storage });
    await server.ensureReady();
    vi.spyOn(storage, "put").mockRejectedValueOnce(new Error("storage unavailable"));
    const checked = container.healthChecks;

    await expect(server.destroy()).rejects.toThrow("storage unavailable");
    const request = server.ensureReady();

    await expect(request).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(container.healthChecks).toBe(checked);
  });

  test("when cleanup fails and the Durable Object restarts, then a request is still refused", async () => {
    const storage = memoryStorage();
    vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("storage reset"));
    const first = setup({ storage });
    await first.server.ensureReady();

    await expect(first.server.destroy()).rejects.toThrow("storage reset");
    const restarted = setup({ storage });
    const request = restarted.server.ensureReady();

    await expect(request).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(restarted.container.starts).toBe(0);
  });

  test("when it is destroyed, then every key but the deleted mark is gone", async () => {
    const storage = memoryStorage();
    const { server } = setup({ storage });
    await server.ensureReady();

    await server.destroy();

    expect([...(await storage.list()).keys()]).toEqual(["deleted-at"]);
  });

  test("when the Durable Object restarts, then a request is still refused", async () => {
    const first = setup();
    await first.server.destroy();
    const restarted = setup({ storage: first.storage });

    const request = restarted.server.ensureReady();

    await expect(request).rejects.toMatchObject({ code: ErrorCode.NotFound });
    expect(restarted.container.starts).toBe(0);
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

describe("given a Durable Object that restarts", () => {
  test("when its container is still running, then resume watches it, sets the timeout and intercepts GitHub without starting it", async () => {
    const { server, container, events } = setup();
    container.alreadyRunning();

    await server.resume();

    expect(container.starts).toBe(0);
    expect(container.monitors).toBe(1);
    expect(container.timeouts).toEqual([35 * 60_000]);
    expect(events).toEqual(["github intercepted"]);
  });

  test("when its container is stopped, then resume does nothing", async () => {
    const { server, container, events } = setup();

    await server.resume();

    expect(container.monitors).toBe(0);
    expect(container.timeouts).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe("given a container whose exec calls are rejected", () => {
  test("when the pause is rejected, then OpenCode is resumed and the stop fails at the pause step", async () => {
    const { server, container, events } = setup();
    await server.ensureReady();
    container.rejects.add(Command.pauseOpencode.join(" "));
    events.length = 0;

    const stop = server.stop();

    await expect(stop).rejects.toMatchObject({
      code: ErrorCode.SandboxSaveFailed,
      details: { step: "pause" },
    });
    expect(events).toEqual(["STOP rejected", "resumed"]);
    expect(container.running).toBe(true);
  });

  test("when the save fails and the resume is rejected, then the save error is kept and the next request checks health", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, container, backups } = setup();
    await server.ensureReady();
    vi.spyOn(backups, "save").mockRejectedValueOnce(new Error("R2 unavailable"));
    container.rejects.add(Command.resumeOpencode.join(" "));
    const checked = container.healthChecks;

    const stop = server.stop();
    await expect(stop).rejects.toMatchObject({
      code: ErrorCode.SandboxSaveFailed,
      details: { step: "save" },
      cause: new Error("R2 unavailable"),
    });
    container.rejects.clear();
    await server.ensureReady();

    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({ event: "sandbox_resume_failed" }),
    );
    expect(container.healthChecks).toBeGreaterThan(checked);
  });
});
