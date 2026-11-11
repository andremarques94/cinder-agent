import * as v from "valibot";

const Id = v.pipe(v.string(), v.regex(/^[1-9][0-9]*$/), v.transform(Number));

const PrivateKey = v.pipe(
  v.string(),
  v.transform((key: string) => key.replaceAll("\\n", "\n").trim()),
  v.startsWith("-----BEGIN PRIVATE KEY-----"),
);

const Unset = v.optional(v.literal(""), "");

const GithubSchema = v.union(
  [
    v.pipe(
      v.object({
        GITHUB_APP_ID: Id,
        GITHUB_APP_PRIVATE_KEY: PrivateKey,
      }),
      v.transform((env) => ({
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY,
      })),
    ),
    v.pipe(
      v.object({
        GITHUB_APP_ID: Unset,
        GITHUB_APP_PRIVATE_KEY: Unset,
      }),
      v.transform(() => null),
    ),
  ],
  "set both GITHUB_APP_ID and a PKCS#8 GITHUB_APP_PRIVATE_KEY, or neither",
);

const ConfigSchema = v.pipe(
  v.object({
    SANDBOX_DOMAIN: v.pipe(v.string(), v.minLength(1), v.toLowerCase()),
    OPENCODE_INSTANCE: v.fallback(
      v.picklist(["lite", "standard-1", "standard-2", "standard-3", "standard-4"]),
      "standard-1",
    ),
    INACTIVITY_TIMEOUT_MINUTES: v.fallback(
      v.pipe(v.unknown(), v.transform(Number), v.number(), v.gtValue(0)),
      30,
    ),
    ADMIN_TOKEN: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
    ACCESS_AUD: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
  }),
  v.transform((env) => ({
    sandboxDomain: env.SANDBOX_DOMAIN,
    instance: env.OPENCODE_INSTANCE,
    inactivityTimeoutMs: env.INACTIVITY_TIMEOUT_MINUTES * 60_000,
    adminToken: env.ADMIN_TOKEN,
    accessAud: env.ACCESS_AUD,
  })),
);

export type Config = ReturnType<typeof loadConfig>;
export type GithubConfig = NonNullable<Config["github"]>;

export function loadConfig(env: unknown) {
  return { ...v.parse(ConfigSchema, env), github: v.parse(GithubSchema, env) };
}
