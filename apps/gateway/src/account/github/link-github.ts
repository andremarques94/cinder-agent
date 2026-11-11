import type { UserStore } from "@/users";

import type { GithubInstallation, GithubSignIn, GithubUser } from "./github-sign-in.ts";

export interface LinkedInstallation {
  installationId: number;
  login: string;
}

type Outcome = "linked" | "notOwned" | "takenByOthers";

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
    const outcome = await linkInstallation(github, users, userId, token, githubUser, installation);
    result[outcome].push({
      installationId: installation.id,
      login: installation.account?.login ?? `#${installation.id}`,
    });
  }
  return result;
}

async function linkInstallation(
  github: GithubSignIn,
  users: UserStore,
  userId: string,
  token: string,
  githubUser: GithubUser,
  installation: GithubInstallation,
): Promise<Outcome> {
  if (!(await owns(github, token, githubUser, installation))) {
    return "notOwned";
  }
  const accountLogin = installation.account?.login ?? null;
  if (!(await users.claimInstallation(userId, installation.id, accountLogin))) {
    return "takenByOthers";
  }
  return "linked";
}

async function owns(
  github: GithubSignIn,
  token: string,
  user: GithubUser,
  { account }: GithubInstallation,
): Promise<boolean> {
  if (!account) {
    return false;
  }
  switch (account.type) {
    case "User":
      return account.id === user.id;
    case "Organization":
      return github.isOrgAdmin(token, account.login);
    case "Other":
      return false;
  }
}
