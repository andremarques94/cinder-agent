import type { DirectoryBackup } from "@cloudflare/sandbox";
import * as v from "valibot";

import { describeError, log } from "@/lib/log";

import { PERSIST_DIR } from "../container/layout.ts";

const SAVED_BACKUP_KEY = "backup";
const EXCLUDE = ["node_modules/", "data/opencode/log/"];

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

export type BackupStore = Pick<DirectoryBackup, "backup" | "restore" | "delete">;

export interface BackupRecordStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: SavedBackup): Promise<void>;
  delete(key: string): Promise<boolean>;
}

export class WorkspaceBackups {
  constructor(
    private readonly store: BackupStore,
    private readonly records: BackupRecordStore,
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

  async save(): Promise<SavedBackup> {
    const previous = await this.latest();
    const record = await this.store.backup({ dir: PERSIST_DIR, exclude: EXCLUDE });
    const saved = { savedAt: this.now(), record };
    await this.records.put(SAVED_BACKUP_KEY, saved);
    if (previous) {
      try {
        await this.store.delete(previous.record);
      } catch (error) {
        log.warn("backup_delete_failed", { id: previous.record.id, ...describeError(error) });
      }
    }
    return saved;
  }

  async deleteLatest(): Promise<void> {
    const latest = await this.latest();
    if (latest) {
      await this.store.delete(latest.record);
      await this.records.delete(SAVED_BACKUP_KEY);
    }
  }
}
