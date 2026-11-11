import type { DirectoryBackup } from "@cloudflare/sandbox";
import * as v from "valibot";

import { describeError, log } from "@/lib/log";

import { PERSIST_DIR } from "../container/layout.ts";

const SAVED_BACKUP_KEY = "backup";
const EXCLUDE = ["node_modules/", "data/opencode/log/"];
// https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#bucket-method-definitions
const DELETE_BATCH = 1000;

const SavedBackupSchema = v.object({
  savedAt: v.number(),
  record: v.object({
    id: v.string(),
    dir: v.string(),
    size: v.number(),
    name: v.optional(v.string()),
    sha256: v.string(),
    format: v.literal("tar+zstd/1"),
  }),
});

export type SavedBackup = v.InferOutput<typeof SavedBackupSchema>;

export type BackupStore = Pick<DirectoryBackup, "backup" | "restore">;

export interface BackupRecordStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: SavedBackup): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export interface BackupBucket {
  list(options: { prefix: string; cursor?: string }): Promise<{
    objects: { key: string }[];
    truncated: boolean;
    cursor?: string;
  }>;
  delete(keys: string[]): Promise<void>;
}

export class WorkspaceBackups {
  constructor(
    private readonly store: BackupStore,
    private readonly records: BackupRecordStore,
    private readonly bucket: BackupBucket,
    private readonly prefix: string,
    private readonly now: () => number = Date.now,
  ) {}

  async latest(): Promise<SavedBackup | null> {
    const stored = await this.records.get(SAVED_BACKUP_KEY);
    return stored === undefined ? null : v.parse(SavedBackupSchema, stored);
  }

  async restoreLatest(): Promise<void> {
    const latest = await this.latest();
    if (latest) {
      await this.store.restore(latest.record);
    }
  }

  // Every archive under the prefix except the one just recorded is swept, so an old archive
  // whose delete failed, or one uploaded without its record, is retried on the next save.
  async save(): Promise<SavedBackup> {
    // Reading the record first fails the save when it's corrupted, instead of replacing it.
    await this.latest();
    const record = await this.store.backup({ dir: PERSIST_DIR, exclude: EXCLUDE });
    const saved = { savedAt: this.now(), record };
    await this.records.put(SAVED_BACKUP_KEY, saved);
    try {
      await this.deleteObjects((key) => !isArchiveOf(key, this.prefix, record.id));
    } catch (error) {
      log.warn("backup_sweep_failed", describeError(error));
    }
    return saved;
  }

  async deleteAll(): Promise<void> {
    await this.deleteObjects(() => true);
    await this.records.delete(SAVED_BACKUP_KEY);
  }

  private async deleteObjects(shouldDelete: (key: string) => boolean): Promise<void> {
    const keys = (await this.listKeys()).filter(shouldDelete);
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      await this.bucket.delete(keys.slice(start, start + DELETE_BATCH));
    }
  }

  private async listKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix: this.prefix, cursor });
      keys.push(...page.objects.map((object) => object.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor !== undefined);
    return keys;
  }
}

// DirectoryBackup stores each archive at `<prefix><record id>.tar.zst`.
function isArchiveOf(key: string, prefix: string, id: string): boolean {
  return key.startsWith(`${prefix}${id}.`);
}
