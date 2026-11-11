import { ErrorCode, GatewayError } from "@/lib/errors";
import type { UserStore } from "@/users";

import { pickInstallation, type TokenFor } from "./outbound.ts";

type InstallationUsers = Pick<UserStore, "byId" | "installations" | "githubAccount">;

export async function identityInstallation(
  users: InstallationUsers,
  userId: string,
): Promise<number | null> {
  await requireActiveUser(users, userId);
  return (await users.installations(userId))[0]?.installationId ?? null;
}

export async function installationTokens(
  users: InstallationUsers,
  userId: string,
  installationToken: (installationId: number) => Promise<string>,
): Promise<TokenFor> {
  await requireActiveUser(users, userId);
  return async (owner) => {
    const [installations, account] = await Promise.all([
      users.installations(userId),
      users.githubAccount(userId),
    ]);
    const installationId = pickInstallation(installations, owner, account?.login ?? null);
    return installationId === null ? null : installationToken(installationId);
  };
}

async function requireActiveUser(users: InstallationUsers, userId: string): Promise<void> {
  const user = await users.byId(userId);
  if (!user || user.deletingAt !== null) {
    throw new GatewayError(ErrorCode.NotFound, { details: { reason: "user deleted" } });
  }
}
