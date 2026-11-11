import type { DirectoryBackupRecord } from "@cloudflare/sandbox";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { WorkspaceBackups, type BackupRecordStore, type BackupStore } from "./backups.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

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
  return { backups: new WorkspaceBackups(store, records, () => 1_000), calls, values };
}

test("restoring with no saved backup does nothing", async () => {
  const { backups, calls } = setup();
  await backups.restoreLatest();
  expect(calls).toEqual([]);
});

test("saving stores the record, and the next save replaces and deletes the old one", async () => {
  const { backups, calls } = setup();

  expect(await backups.save()).toEqual({ savedAt: 1_000, record: record("b1") });
  await backups.save();
  await backups.restoreLatest();

  expect(calls).toEqual(["backup /persist", "backup /persist", "delete b1", "restore b2"]);
});

test("a failed delete of the old backup doesn't fail the save", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { backups, values } = setup({ backup: { savedAt: 1, record: record("old") } });
  const store = Reflect.get(backups, "store");
  vi.spyOn(store, "delete").mockRejectedValue(new Error("r2 down"));

  await backups.save();
  expect(values.get("backup")).toEqual({ savedAt: 1_000, record: record("b1") });
});

test("a corrupted record is an error, not an empty sandbox that could overwrite the real backup", async () => {
  const { backups, calls } = setup({ backup: { savedAt: "yesterday" } });
  await expect(backups.restoreLatest()).rejects.toThrow();
  await expect(backups.save()).rejects.toThrow();
  expect(calls).toEqual([]);
});

test("deleteLatest removes the backup and its record, so a revoked user leaves nothing behind", async () => {
  const { backups, calls, values } = setup();
  await backups.deleteLatest();
  await backups.save();
  await backups.deleteLatest();
  expect(calls).toEqual(["backup /persist", "delete b1"]);
  expect(values.has("backup")).toBe(false);
  expect(await backups.latest()).toBeNull();
});
