import { APP_LABEL, isSandboxName } from "@/users";

import { isUnderDomain } from "./hostnames.ts";

export type HostTarget =
  | { kind: "sandbox"; name: string }
  | { kind: "app" }
  | { kind: "unknown-sandbox" }
  | { kind: "gateway" };

export function classifyHost(hostname: string, sandboxDomain: string): HostTarget {
  if (!isUnderDomain(hostname, sandboxDomain)) {
    return { kind: "gateway" };
  }
  const label = hostname.slice(0, -(sandboxDomain.length + 1));
  if (label === APP_LABEL) {
    return { kind: "app" };
  }
  if (isSandboxName(label)) {
    return { kind: "sandbox", name: label };
  }
  return { kind: "unknown-sandbox" };
}
