import * as v from "valibot";

export const APP_LABEL = "app";

const RESERVED = new Set([APP_LABEL, "admin", "api", "www"]);

export const SandboxNameSchema = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "sandbox names must look like `ada` or `team-1`",
  ),
  v.check((name) => !RESERVED.has(name), "this sandbox name is reserved"),
);

export function isSandboxName(name: string): boolean {
  return v.is(SandboxNameSchema, name);
}
