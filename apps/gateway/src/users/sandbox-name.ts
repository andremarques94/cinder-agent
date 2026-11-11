import * as v from "valibot";

export const APP_LABEL = "app";

const RESERVED = new Set([APP_LABEL, "admin", "api", "www"]);

const MAX_DNS_LABEL = 63;
const INVALID_NAME = "sandbox names must look like `ada` or `team-1`";

export const SandboxNameSchema = v.pipe(
  v.string(),
  v.maxLength(MAX_DNS_LABEL, INVALID_NAME),
  v.slug(INVALID_NAME),
  v.excludes("_", INVALID_NAME),
  v.check((name) => !RESERVED.has(name), "this sandbox name is reserved"),
);

export function isSandboxName(name: string): boolean {
  return v.is(SandboxNameSchema, name);
}
