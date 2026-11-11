import type { Config } from "@/lib/config";
import type { SandboxDirectory } from "@/sandbox";
import type { User, UserStore } from "@/users";

export interface AccountVariables {
  config: Config;
  sandboxes: SandboxDirectory;
  users: UserStore;
  access: unknown;
  fetch: typeof fetch;
  font: ArrayBuffer | null;
  user: User;
}

export type AccountEnv = { Variables: AccountVariables };
