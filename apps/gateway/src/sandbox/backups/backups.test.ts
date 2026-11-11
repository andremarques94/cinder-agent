import type { DirectoryBackupRecord } from "@cloudflare/sandbox";
import { describe, expect, test, vi } from "vite-plus/test";

import { WorkspaceBackups, type BackupRecordStore, type BackupStore } from "./backups.ts";

function record(id: string): DirectoryBackupRecord {
  return { id, dir: "/persist", size: 10, sha256: "0".repeat(64), format: "tar+zstd/1" };
}

function setup(stored: Record<string, unknown> = {}) {
  const calls: string[] = [];
  let next = 1;
  const store: BackupStore = {
    backup: async (options) => {
      calls.push(`backup ${options.dir}`);
      return record(`b${next++}`);
    },
    restore: async (backup) => {
      calls.push(`restore ${backup.id}`);
    },
    delete: async (backup) => {
      calls.push(`delete ${backup.id}`);
    },
  };
  const values = new Map(Object.entries(stored));
  const records: BackupRecordStore = {
    get: async (key) => values.get(key),
    put: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => values.delete(key),
  };
  const backups = new WorkspaceBackups(store, records, () => 1_000);
  return { backups, store, calls, values };
}

describe("given no saved backup", () => {
  test("when the latest is restored, then nothing happens", async () => {
    const { backups, calls } = setup();

    await backups.restoreLatest();

    expect(calls).toEqual([]);
  });

  test("when it saves twice and restores, then the old backup is deleted and the new one restored", async () => {
    const { backups, calls } = setup();

    const first = await backups.save();
    await backups.save();
    await backups.restoreLatest();

    expect(first).toEqual({ savedAt: 1_000, record: record("b1") });
    expect(calls).toEqual(["backup /persist", "backup /persist", "delete b1", "restore b2"]);
  });

  test("when a saved backup is deleted, then neither the backup nor its record is left", async () => {
    const { backups, calls, values } = setup();
    await backups.deleteLatest();
    await backups.save();

    await backups.deleteLatest();

    expect(calls).toEqual(["backup /persist", "delete b1"]);
    expect(values.has("backup")).toBe(false);
    expect(await backups.latest()).toBeNull();
  });
});

describe("given an old backup that can't be deleted", () => {
  test("when a new one is saved, then the save still succeeds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { backups, store, values } = setup({ backup: { savedAt: 1, record: record("old") } });
    vi.spyOn(store, "delete").mockRejectedValue(new Error("r2 down"));

    await backups.save();

    expect(values.get("backup")).toEqual({ savedAt: 1_000, record: record("b1") });
  });
});

describe("given a corrupted backup record", () => {
  test("when it restores or saves, then it fails instead of overwriting the real backup", async () => {
    const { backups, calls } = setup({ backup: { savedAt: "yesterday" } });

    const results = await Promise.allSettled([backups.restoreLatest(), backups.save()]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toEqual([]);
  });
});
