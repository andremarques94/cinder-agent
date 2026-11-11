import { expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";
import { migratedDatabase } from "@/testing";

import { isSandboxName } from "../sandbox-name.ts";
import { userStore } from "./user-store.ts";

const store = () => userStore(migratedDatabase(), () => 1_000);

const rejectsWith = (code: ErrorCode) => expect.objectContaining({ code });

test("a new user gets a random id and is found by id, email (any case) and sandbox", async () => {
  const users = store();
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  expect(ada).toEqual({
    id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    email: "ada@example.com",
    sandbox: "ada",
    createdAt: 1_000,
    lastLoginAt: null,
  });
  expect(ada.id).not.toBe("ada");
  expect(await users.byId(ada.id)).toEqual(ada);
  expect(await users.byEmail("Ada@Example.com")).toEqual(ada);
  expect(await users.bySandbox("ada")).toEqual(ada);
  expect(await users.bySandbox("bob")).toBeNull();
});

test("emails and sandbox names are unique", async () => {
  const users = store();
  await users.create({ email: "ada@example.com", sandbox: "ada" });
  await expect(users.create({ email: "ADA@example.com", sandbox: "ada2" })).rejects.toEqual(
    rejectsWith(ErrorCode.Conflict),
  );
  await expect(users.create({ email: "bob@example.com", sandbox: "ada" })).rejects.toEqual(
    rejectsWith(ErrorCode.Conflict),
  );
});

test("a deleted user's sandbox name is retired and never handed out again", async () => {
  const users = store();
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  await users.claimInstallation(ada.id, 7, "ada");
  await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada" });
  expect(await users.delete(ada.id)).toMatchObject({ sandbox: "ada" });
  expect(await users.bySandbox("ada")).toBeNull();
  expect(await users.delete(ada.id)).toBeNull();
  await expect(users.create({ email: "eve@example.com", sandbox: "ada" })).rejects.toEqual(
    rejectsWith(ErrorCode.Conflict),
  );
  const again = await users.create({ email: "ada@example.com", sandbox: "ada-2" });
  expect(again.id).not.toBe(ada.id);
  expect(await users.installations(again.id)).toEqual([]);
  expect(await users.githubAccount(again.id)).toBeNull();
  expect(await users.allInstallations()).toEqual([]);
});

test("a user can claim many installations, and each installation belongs to one user", async () => {
  let clock = 1_000;
  const users = userStore(migratedDatabase(), () => clock++);
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });

  expect(await users.claimInstallation(ada.id, 8, "ada-org")).toBe(true);
  expect(await users.claimInstallation(ada.id, 7, "ada")).toBe(true);
  expect(await users.claimInstallation(ada.id, 7, "ada-renamed")).toBe(true);
  expect(await users.installations(ada.id)).toEqual([
    { installationId: 8, accountLogin: "ada-org", createdAt: 1_002 },
    { installationId: 7, accountLogin: "ada-renamed", createdAt: 1_003 },
  ]);

  expect(await users.claimInstallation(bob.id, 8, "stolen")).toBe(false);
  expect(await users.installations(bob.id)).toEqual([]);
  expect((await users.installations(ada.id))[0]).toMatchObject({ accountLogin: "ada-org" });
  expect((await users.allInstallations()).map((i) => [i.userId, i.installationId])).toEqual([
    [ada.id, 8],
    [ada.id, 7],
  ]);

  await expect(users.claimInstallation("missing", 9, null)).rejects.toEqual(
    rejectsWith(ErrorCode.NotFound),
  );

  expect(await users.removeInstallation(bob.id, 8)).toBe(false);
  expect(await users.removeInstallation(ada.id, 8)).toBe(true);
  expect(await users.claimInstallation(bob.id, 8, "bob-org")).toBe(true);
  await users.clearInstallations(ada.id);
  expect(await users.installations(ada.id)).toEqual([]);
  expect(await users.installations(bob.id)).toHaveLength(1);
});

test("a GitHub account links to one user; relinking replaces it", async () => {
  const users = store();
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });
  expect(await users.githubAccount(ada.id)).toBeNull();

  await users.linkGithubAccount(ada.id, { githubUserId: 1, login: "ada" });
  await users.linkGithubAccount(ada.id, { githubUserId: 2, login: "ada-work" });
  expect(await users.githubAccount(ada.id)).toEqual({ githubUserId: 2, login: "ada-work" });

  await expect(users.linkGithubAccount(bob.id, { githubUserId: 2, login: "x" })).rejects.toEqual(
    rejectsWith(ErrorCode.GithubAccountTaken),
  );
  await users.linkGithubAccount(bob.id, { githubUserId: 1, login: "ada" });
  expect(await users.githubAccount(bob.id)).toEqual({ githubUserId: 1, login: "ada" });
  await expect(users.linkGithubAccount("missing", { githubUserId: 3, login: "x" })).rejects.toEqual(
    rejectsWith(ErrorCode.NotFound),
  );
});

test("list and recordLogin", async () => {
  const users = store();
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  await users.create({ email: "bob@example.com", sandbox: "bob" });
  await users.recordLogin(ada.id);
  expect((await users.list()).map((u) => [u.sandbox, u.lastLoginAt])).toEqual([
    ["ada", 1_000],
    ["bob", null],
  ]);
});

test("sandbox names are DNS labels and never a reserved hostname", () => {
  for (const good of ["ada", "team-1", "a"]) {
    expect(isSandboxName(good)).toBe(true);
  }
  for (const bad of ["app", "api", "www", "admin", "Ada", "a.b", "-x", "x-", "", "a b"]) {
    expect(isSandboxName(bad)).toBe(false);
  }
});
