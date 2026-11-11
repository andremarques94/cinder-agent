import type { GithubConfig } from "@/lib/config";
import { describeError, log } from "@/lib/log";

import { githubApp, type GitIdentity } from "./github-app.ts";
import { GITHUB_HOSTS } from "./outbound.ts";

export interface SandboxGithub {
  intercept(): Promise<void>;
  identity(): Promise<GitIdentity | null>;
}

interface SandboxGithubDeps {
  config: GithubConfig | null;
  container: Pick<Container, "interceptOutboundHttps">;
  outbound: () => Fetcher;
  identityInstallation: () => Promise<number | null>;
}

export function sandboxGithub({
  config,
  container,
  outbound,
  identityInstallation,
}: SandboxGithubDeps): SandboxGithub | null {
  if (!config) {
    return null;
  }
  return {
    // https://developers.cloudflare.com/containers/api/durable-object-container/
    intercept: async () => {
      const binding = outbound();
      for (const host of GITHUB_HOSTS) {
        await container.interceptOutboundHttps(host, binding);
      }
    },
    identity: async () => {
      const installationId = await identityInstallation();
      if (installationId === null) {
        return null;
      }
      try {
        return await githubApp(config).botIdentity(installationId);
      } catch (error) {
        log.warn("github_identity_failed", describeError(error));
        return null;
      }
    },
  };
}
