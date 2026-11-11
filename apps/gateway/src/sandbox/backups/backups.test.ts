import type { DirectoryBackupRecord } from "@cloudflare/sandbox";
import { describe, expect, test, vi } from "vite-plus/test";

import {
  WorkspaceBackups,
  type BackupBucket,
  type BackupRecordStore,
  type BackupStore,
} from "./backups.ts";

const PREFIX = "sandboxes/u1/";

function record(id: string): DirectoryBackupRecord {
  return { id, dir: "/persist", size: 10, sha256: "0".repeat(64), format: "tar+zstd/1" };
}

function setup({
  stored = {},
  objects = [],
  pageSize = 1000,
}: { stored?: Record<string, unknown>; objects?: string[]; pageSize?: number } = {}) {
  const calls: string[] = [];
  const keys = new Set(objects);
  let next = 1;
  const store: BackupStore = {
    backup: async (options) => {
      calls.push(`backup ${options.dir}`);
      const id = `b${next++}`;
      keys.add(`${PREFIX}${id}.tar.zst`);
      return record(id);
    },
    restore: async (backup) => {
      calls.push(`restore ${backup.id}`);
    },
  };
  const bucket: BackupBucket = {
    list: async ({ prefix, cursor }) => {
      const matching = [...keys].filter((key) => key.startsWith(prefix)).toSorted();
      const start = cursor === undefined ? 0 : Number(cursor);
      const page = matching.slice(start, start + pageSize);
      const end = start + page.length;
      return {
        objects: page.map((key) => ({ key })),
        truncated: end < matching.length,
        cursor: `${end}`,
      };
    },
    delete: async (deleted) => {
      calls.push(`delete ${deleted.length}`);
      for (const key of deleted) {
        keys.delete(key);
      }
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
  const backups = new WorkspaceBackups(store, records, bucket, PREFIX, () => 1_000);
  return { backups, bucket, calls, values, keys };
}

describe("given no saved backup", () => {
  test("when the latest is restored, then nothing happens", async () => {
    const { backups, calls } = setup();

    await backups.restoreLatest();

    expect(calls).toEqual([]);
  });

  test("when it saves twice and restores, then only the new archive is kept and restored", async () => {
    const { backups, calls, keys } = setup();

    const first = await backups.save();
    await backups.save();
    await backups.restoreLatest();

    expect(first).toEqual({ savedAt: 1_000, record: record("b1") });
    expect([...keys]).toEqual([`${PREFIX}b2.tar.zst`]);
    expect(calls.at(-1)).toBe("restore b2");
  });
});

describe("given archives left behind under the user's prefix", () => {
  test("when a new backup is saved, then the old ones are swept and other users' are kept", async () => {
    const orphans = [`${PREFIX}lost.tar.zst`, `${PREFIX}old.tar.zst`];
    const { backups, keys } = setup({ objects: [...orphans, "sandboxes/u2/theirs.tar.zst"] });

    await backups.save();

    expect([...keys].toSorted()).toEqual([`${PREFIX}b1.tar.zst`, "sandboxes/u2/theirs.tar.zst"]);
  });

  test("when every backup is deleted, then each page is deleted and the record is gone", async () => {
    const orphans = Array.from({ length: 5 }, (_, i) => `${PREFIX}orphan-${i}.tar.zst`);
    const { backups, keys, values } = setup({
      stored: { backup: { savedAt: 1, record: record("orphan-0") } },
      objects: [...orphans, "sandboxes/u2/theirs.tar.zst"],
      pageSize: 2,
    });

    await backups.deleteAll();

    expect([...keys]).toEqual(["sandboxes/u2/theirs.tar.zst"]);
    expect(values.has("backup")).toBe(false);
    expect(await backups.latest()).toBeNull();
  });
});

describe("given more archives than one delete call takes", () => {
  test("when every backup is deleted, then they go in batches of 1000", async () => {
    const objects = Array.from({ length: 2_500 }, (_, i) => `${PREFIX}orphan-${i}.tar.zst`);
    const { backups, calls, keys } = setup({ objects });

    await backups.deleteAll();

    expect(calls).toEqual(["delete 1000", "delete 1000", "delete 500"]);
    expect(keys.size).toBe(0);
  });
});

describe("given an old archive that can't be deleted", () => {
  test("when a new one is saved, then the save still succeeds and the next save retries", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { backups, bucket, values, keys } = setup({
      stored: { backup: { savedAt: 1, record: record("old") } },
      objects: [`${PREFIX}old.tar.zst`],
    });
    vi.spyOn(bucket, "delete").mockRejectedValueOnce(new Error("r2 down"));

    await backups.save();
    await backups.save();

    expect(values.get("backup")).toEqual({ savedAt: 1_000, record: record("b2") });
    expect([...keys]).toEqual([`${PREFIX}b2.tar.zst`]);
  });

  test("when every backup is deleted, then it fails so the deletion can be retried", async () => {
    const { backups, bucket, values } = setup({
      stored: { backup: { savedAt: 1, record: record("old") } },
      objects: [`${PREFIX}old.tar.zst`],
    });
    vi.spyOn(bucket, "delete").mockRejectedValueOnce(new Error("r2 down"));

    const deleted = backups.deleteAll();

    await expect(deleted).rejects.toThrow("r2 down");
    expect(values.has("backup")).toBe(true);
  });
});

describe("given a corrupted backup record", () => {
  test("when it restores or saves, then it fails instead of overwriting the real backup", async () => {
    const { backups, calls } = setup({ stored: { backup: { savedAt: "yesterday" } } });

    const results = await Promise.allSettled([backups.restoreLatest(), backups.save()]);

    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(calls).toEqual([]);
  });
});
