import * as v from "valibot";

export const APP_NAME = "cinder-agent";

const ACCESS_TEAM_DOMAIN_SUFFIX = ".cloudflareaccess.com";

export const IdSchema = v.pipe(v.string(), v.digits(), v.toNumber(), v.integer(), v.minValue(1));

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
        GITHUB_APP_ID: IdSchema,
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

const Filled = v.pipe(v.string(), v.trim(), v.nonEmpty());

const GithubSignInSchema = v.union(
  [
    v.pipe(
      v.object({
        GITHUB_APP_SLUG: v.pipe(Filled, v.slug()),
        GITHUB_CLIENT_ID: Filled,
        GITHUB_CLIENT_SECRET: Filled,
      }),
      v.transform((env) => ({
        slug: env.GITHUB_APP_SLUG,
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      })),
    ),
    v.pipe(
      v.object({
        GITHUB_APP_SLUG: Unset,
        GITHUB_CLIENT_ID: Unset,
        GITHUB_CLIENT_SECRET: Unset,
      }),
      v.transform(() => null),
    ),
  ],
  "set all of GITHUB_APP_SLUG, GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET, or none",
);

// https://developers.cloudflare.com/containers/api/durable-object-container/#setinactivitytimeout
// caps the container's timeout at 6 hours, and the sandbox adds 5 minutes to this setting.
const MAX_INACTIVITY_TIMEOUT_MINUTES = 355;
const INACTIVITY_TIMEOUT_RANGE = `INACTIVITY_TIMEOUT_MINUTES must be more than 0 and at most ${MAX_INACTIVITY_TIMEOUT_MINUTES}`;

const ConfigSchema = v.pipe(
  v.object({
    SANDBOX_DOMAIN: v.pipe(v.string(), v.minLength(1), v.toLowerCase()),
    OPENCODE_INSTANCE: v.fallback(
      v.picklist(["lite", "standard-1", "standard-2", "standard-3", "standard-4"]),
      "standard-1",
    ),
    INACTIVITY_TIMEOUT_MINUTES: v.optional(
      v.pipe(
        v.unknown(),
        v.transform(Number),
        v.number(INACTIVITY_TIMEOUT_RANGE),
        v.finite(INACTIVITY_TIMEOUT_RANGE),
        v.gtValue(0, INACTIVITY_TIMEOUT_RANGE),
        v.maxValue(MAX_INACTIVITY_TIMEOUT_MINUTES, INACTIVITY_TIMEOUT_RANGE),
      ),
      30,
    ),
    ADMIN_TOKEN: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
    ACCESS_AUD: v.fallback(v.optional(v.pipe(v.string(), v.minLength(1))), undefined),
    ACCESS_TEAM_DOMAIN: v.fallback(
      v.optional(v.pipe(v.string(), v.url(), v.check(isAccessTeamDomain))),
      undefined,
    ),
  }),
  v.transform((env) => ({
    sandboxDomain: env.SANDBOX_DOMAIN,
    instance: env.OPENCODE_INSTANCE,
    inactivityTimeoutMs: env.INACTIVITY_TIMEOUT_MINUTES * 60_000,
    adminToken: env.ADMIN_TOKEN,
    accessAud: env.ACCESS_AUD,
    accessTeamDomain: env.ACCESS_TEAM_DOMAIN,
  })),
);

export type Config = ReturnType<typeof loadConfig>;
export type GithubConfig = NonNullable<Config["github"]>;
export type GithubSignInConfig = NonNullable<Config["githubSignIn"]>;

export function loadConfig(env: unknown) {
  const github = v.parse(GithubSchema, env);
  const githubSignIn = v.parse(GithubSignInSchema, env);
  if (githubSignIn && !github) {
    throw new Error("GitHub sign-in needs GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY too");
  }
  return { ...v.parse(ConfigSchema, env), github, githubSignIn };
}

function isAccessTeamDomain(value: string): boolean {
  const url = URL.parse(value);
  return (
    url !== null &&
    url.protocol === "https:" &&
    url.hostname.endsWith(ACCESS_TEAM_DOMAIN_SUFFIX) &&
    url.origin === value
  );
}
