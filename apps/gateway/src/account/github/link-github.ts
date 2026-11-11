import type { UserStore } from "@/users";

import type { GithubInstallation, GithubSignIn, GithubUser } from "./github-sign-in.ts";

export interface LinkedInstallation {
  installationId: number;
  login: string;
}

export interface LinkResult {
  login: string;
  linked: LinkedInstallation[];
  notOwned: LinkedInstallation[];
  takenByOthers: LinkedInstallation[];
}

// https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url
export async function linkGithub(
  github: GithubSignIn,
  users: UserStore,
  userId: string,
  token: string,
): Promise<LinkResult> {
  const githubUser = await github.user(token);
  await users.linkGithubAccount(userId, { githubUserId: githubUser.id, login: githubUser.login });

  const result: LinkResult = {
    login: githubUser.login,
    linked: [],
    notOwned: [],
    takenByOthers: [],
  };
  for (const installation of await github.installations(token)) {
    const login = installation.account?.login ?? `#${installation.id}`;
    const entry = { installationId: installation.id, login };
    if (!(await owns(github, token, githubUser, installation))) {
      result.notOwned.push(entry);
    } else if (
      await users.claimInstallation(userId, installation.id, installation.account?.login ?? null)
    ) {
      result.linked.push(entry);
    } else {
      result.takenByOthers.push(entry);
    }
  }
  return result;
}

async function owns(
  github: GithubSignIn,
  token: string,
  user: GithubUser,
  { account }: GithubInstallation,
): Promise<boolean> {
  if (account?.type === "User") {
    return account.id === user.id;
  }
  if (account?.type === "Organization") {
    return github.isOrgAdmin(token, account.login);
  }
  return false;
}
