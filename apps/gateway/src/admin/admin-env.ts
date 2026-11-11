import type { Context } from "hono";

import type { Config } from "@/lib/config";
import type { SandboxDirectory } from "@/sandbox";
import type { UserStore } from "@/users";

export interface AdminVariables {
  config: Config;
  sandboxes: SandboxDirectory;
  users: UserStore;
}

export type AdminEnv = { Variables: AdminVariables };
export type AdminContext = Context<AdminEnv>;
