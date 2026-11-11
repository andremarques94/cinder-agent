import { describe, expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";
import { migratedDatabase } from "@/testing";
import { userStore } from "@/users";

import { identityInstallation, installationTokens } from "./installation-tokens.ts";

const token = async (installationId: number) => `ghs_${installationId}`;

async function adaWithInstallations() {
  let clock = 1_000;
  const users = userStore(migratedDatabase(), () => clock++);
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  await users.claimInstallation(ada.id, 7, "ada");
  await users.claimInstallation(ada.id, 8, "ada-org");
  await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada" });
  return { users, ada };
}

describe("given a user with two installations", () => {
  test("when the sandbox asks for its Git identity, then it gets the oldest installation", async () => {
    const { users, ada } = await adaWithInstallations();

    const installationId = await identityInstallation(users, ada.id);

    expect(installationId).toBe(7);
  });

  test.each([
    ["ada-org", "ghs_8"],
    ["someone-else", "ghs_7"],
  ])("when a request for %s needs a token, then it gets %s", async (owner, expected) => {
    const { users, ada } = await adaWithInstallations();

    const tokenFor = await installationTokens(users, ada.id, token);

    expect(await tokenFor(owner)).toBe(expected);
  });
});

describe("given a user with no installations", () => {
  test("when a request needs a token, then there is none", async () => {
    const users = userStore(migratedDatabase());
    const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });

    const tokenFor = await installationTokens(users, ada.id, token);

    expect(await tokenFor("ada")).toBeNull();
  });
});

describe("given a user who is being deleted", () => {
  test.each([
    [
      "the Git identity",
      (users: ReturnType<typeof userStore>, id: string) => identityInstallation(users, id),
    ],
    [
      "tokens",
      (users: ReturnType<typeof userStore>, id: string) => installationTokens(users, id, token),
    ],
  ])("when the sandbox asks for %s, then it is refused", async (_, ask) => {
    const { users, ada } = await adaWithInstallations();
    await users.markDeleting(ada.id);

    const asked = ask(users, ada.id);

    await expect(asked).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });
});

describe("given a user who was deleted", () => {
  test("when the sandbox asks for tokens, then it is refused", async () => {
    const { users, ada } = await adaWithInstallations();
    await users.delete(ada.id);

    const asked = installationTokens(users, ada.id, token);

    await expect(asked).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });
});
