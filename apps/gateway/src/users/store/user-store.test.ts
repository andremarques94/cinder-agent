import { describe, expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";
import { migratedDatabase } from "@/testing";

import { isSandboxName } from "../sandbox-name.ts";
import { userStore } from "./user-store.ts";

const rejectsWith = (code: ErrorCode) => expect.objectContaining({ code });

async function twoUsers() {
  let clock = 1_000;
  const users = userStore(migratedDatabase(), () => clock++);
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });
  return { users, ada, bob };
}

describe("given an empty store", () => {
  test("when a user is created, then it gets a random id and is found by id, email and sandbox", async () => {
    const users = userStore(migratedDatabase(), () => 1_000);

    const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });

    expect(ada).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: "ada@example.com",
      sandbox: "ada",
      createdAt: 1_000,
      lastLoginAt: null,
      deletingAt: null,
    });
    expect(ada.id).not.toBe("ada");
    expect(await users.byId(ada.id)).toEqual(ada);
    expect(await users.byEmail("Ada@Example.com")).toEqual(ada);
    expect(await users.bySandbox("ada")).toEqual(ada);
    expect(await users.bySandbox("bob")).toBeNull();
  });
});

describe("given a user being deleted", () => {
  test("when they are looked up, then only the admin's lookup by id finds them", async () => {
    const { users, ada } = await twoUsers();

    await users.markDeleting(ada.id);

    expect(await users.byId(ada.id)).toMatchObject({ deletingAt: expect.any(Number) });
    expect(await users.byEmail(ada.email)).toBeNull();
    expect(await users.bySandbox(ada.sandbox)).toBeNull();
  });

  test("when they are marked again, then the first time is kept", async () => {
    const { users, ada } = await twoUsers();
    await users.markDeleting(ada.id);
    const first = (await users.byId(ada.id))?.deletingAt;

    await users.markDeleting(ada.id);

    expect((await users.byId(ada.id))?.deletingAt).toBe(first);
  });
});

describe("given two users", () => {
  test.each([
    ["ADA@example.com", "ada2"],
    ["cy@example.com", "ada"],
  ])("when %s is invited as %s, then it is a conflict", async (email, sandbox) => {
    const { users } = await twoUsers();

    const create = users.create({ email, sandbox });

    await expect(create).rejects.toEqual(rejectsWith(ErrorCode.Conflict));
  });

  test("when one signs in, then the list shows their last sign-in", async () => {
    const { users, ada } = await twoUsers();

    await users.recordLogin(ada.id);
    const list = await users.list();

    expect(list.map((user) => [user.sandbox, user.lastLoginAt])).toEqual([
      ["ada", 1_002],
      ["bob", null],
    ]);
  });
});

describe("given a user with a GitHub account and an installation", () => {
  async function linkedAda() {
    const { users, ada } = await twoUsers();
    await users.claimInstallation(ada.id, 7, "ada");
    await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada" });
    return { users, ada };
  }

  test("when the user is deleted, then they are gone and deleting again finds nothing", async () => {
    const { users, ada } = await linkedAda();

    const deleted = await users.delete(ada.id);

    expect(deleted).toMatchObject({ sandbox: "ada" });
    expect(await users.bySandbox("ada")).toBeNull();
    expect(await users.delete(ada.id)).toBeNull();
    expect(await users.allInstallations()).toEqual([]);
  });

  test("when the user is deleted, then their sandbox name is never handed out again", async () => {
    const { users, ada } = await linkedAda();
    await users.delete(ada.id);

    const reuse = users.create({ email: "eve@example.com", sandbox: "ada" });

    await expect(reuse).rejects.toEqual(rejectsWith(ErrorCode.Conflict));
  });

  test("when the same email is invited again, then the new user starts with nothing", async () => {
    const { users, ada } = await linkedAda();
    await users.delete(ada.id);

    const again = await users.create({ email: "ada@example.com", sandbox: "ada-2" });

    expect(again.id).not.toBe(ada.id);
    expect(await users.installations(again.id)).toEqual([]);
    expect(await users.githubAccount(again.id)).toBeNull();
  });
});

describe("given installations claimed by Ada", () => {
  async function claimed() {
    const setup = await twoUsers();
    await setup.users.claimInstallation(setup.ada.id, 8, "ada-org");
    await setup.users.claimInstallation(setup.ada.id, 7, "ada");
    return setup;
  }

  test("when Ada claims one again, then its account is updated and the order kept", async () => {
    const { users, ada } = await claimed();

    const claimedAgain = await users.claimInstallation(ada.id, 7, "ada-renamed");

    expect(claimedAgain).toBe(true);
    expect(await users.installations(ada.id)).toEqual([
      { installationId: 8, accountLogin: "ada-org", createdAt: 1_002 },
      { installationId: 7, accountLogin: "ada-renamed", createdAt: 1_003 },
    ]);
  });

  test("when Bob claims one, then it stays Ada's", async () => {
    const { users, ada, bob } = await claimed();

    const claimedByBob = await users.claimInstallation(bob.id, 8, "stolen");

    expect(claimedByBob).toBe(false);
    expect(await users.installations(bob.id)).toEqual([]);
    expect((await users.allInstallations()).map((i) => [i.userId, i.installationId])).toEqual([
      [ada.id, 8],
      [ada.id, 7],
    ]);
  });

  test("when Bob removes one, then nothing is removed", async () => {
    const { users, ada, bob } = await claimed();

    const removed = await users.removeInstallation(bob.id, 8);

    expect(removed).toBe(false);
    expect(await users.installations(ada.id)).toHaveLength(2);
  });

  test("when Ada removes one, then Bob can claim it", async () => {
    const { users, ada, bob } = await claimed();

    const removed = await users.removeInstallation(ada.id, 8);
    const claimedByBob = await users.claimInstallation(bob.id, 8, "bob-org");

    expect(removed).toBe(true);
    expect(claimedByBob).toBe(true);
  });

  test("when Ada's installations are cleared, then she has none", async () => {
    const { users, ada } = await claimed();

    await users.clearInstallations(ada.id);

    expect(await users.installations(ada.id)).toEqual([]);
  });

  test("when a missing user claims one, then it is not found", async () => {
    const { users } = await claimed();

    const claim = users.claimInstallation("missing", 9, null);

    await expect(claim).rejects.toEqual(rejectsWith(ErrorCode.NotFound));
  });
});

describe("given Ada's GitHub account is linked", () => {
  async function linked() {
    const setup = await twoUsers();
    await setup.users.linkGithubAccount(setup.ada.id, { githubUserId: 1, login: "ada" });
    return setup;
  }

  test("when Ada links another account, then it replaces the first", async () => {
    const { users, ada } = await linked();

    await users.linkGithubAccount(ada.id, { githubUserId: 2, login: "ada-work" });

    expect(await users.githubAccount(ada.id)).toEqual({ githubUserId: 2, login: "ada-work" });
  });

  test("when Bob links the same account, then it is taken", async () => {
    const { users, bob } = await linked();

    const link = users.linkGithubAccount(bob.id, { githubUserId: 1, login: "ada" });

    await expect(link).rejects.toEqual(rejectsWith(ErrorCode.GithubAccountTaken));
  });

  test("when a missing user links an account, then it is not found", async () => {
    const { users } = await linked();

    const link = users.linkGithubAccount("missing", { githubUserId: 3, login: "x" });

    await expect(link).rejects.toEqual(rejectsWith(ErrorCode.NotFound));
  });
});

describe("given a sandbox name", () => {
  test.each(["ada", "team-1", "a", "a".repeat(63)])(
    "when %s is checked, then it is a valid DNS label",
    (name) => {
      const valid = isSandboxName(name);

      expect(valid).toBe(true);
    },
  );

  test.each([
    "app",
    "api",
    "www",
    "admin",
    "Ada",
    "a.b",
    "a_b",
    "-x",
    "x-",
    "",
    "a b",
    "a".repeat(64),
  ])("when %j is checked, then it is refused", (name) => {
    const valid = isSandboxName(name);

    expect(valid).toBe(false);
  });
});
