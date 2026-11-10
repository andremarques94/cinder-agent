import type { Config } from "@/config";

import { isUnderDomain, sandboxHost } from "./hostnames.ts";

export type HostTarget =
  | { kind: "sandbox"; name: string }
  | { kind: "unknown-sandbox" }
  | { kind: "gateway" };

export type HostConfig = Pick<Config, "sandboxDomain" | "sandboxes">;

export function classifyHost(hostname: string, config: HostConfig): HostTarget {
  if (!isUnderDomain(hostname, config.sandboxDomain)) {
    return { kind: "gateway" };
  }
  for (const name of config.sandboxes) {
    if (hostname === sandboxHost(name, config.sandboxDomain)) {
      return { kind: "sandbox", name };
    }
  }
  return { kind: "unknown-sandbox" };
}
