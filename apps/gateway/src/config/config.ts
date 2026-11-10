import * as v from "valibot";

const SandboxName = v.pipe(
  v.string(),
  v.regex(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "sandbox names must look like `ada` or `team-1`",
  ),
);

const SandboxList = v.pipe(
  v.string(),
  v.toLowerCase(),
  v.transform((list: string) =>
    list
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  ),
  v.array(SandboxName),
  v.transform((names: string[]) => new Set(names)),
);

const ConfigSchema = v.pipe(
  v.object({
    SANDBOX_DOMAIN: v.pipe(v.string(), v.minLength(1), v.toLowerCase()),
    SANDBOXES: v.optional(SandboxList, ""),
    OPENCODE_INSTANCE: v.fallback(
      v.picklist(["lite", "standard-1", "standard-2", "standard-3", "standard-4"]),
      "standard-1",
    ),
    INACTIVITY_TIMEOUT_MINUTES: v.fallback(
      v.pipe(v.unknown(), v.transform(Number), v.number(), v.gtValue(0)),
      30,
    ),
    ADMIN_TOKEN: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
  }),
  v.transform((env) => ({
    sandboxDomain: env.SANDBOX_DOMAIN,
    sandboxes: env.SANDBOXES,
    instance: env.OPENCODE_INSTANCE,
    inactivityTimeoutMs: env.INACTIVITY_TIMEOUT_MINUTES * 60_000,
    adminToken: env.ADMIN_TOKEN,
  })),
);

export type Config = v.InferOutput<typeof ConfigSchema>;
export type InstanceType = Config["instance"];

export function loadConfig(env: unknown): Config {
  return v.parse(ConfigSchema, env);
}
