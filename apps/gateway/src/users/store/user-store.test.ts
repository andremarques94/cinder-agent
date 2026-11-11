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
    installationId: null,
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
  await users.setInstallation(ada.id, 7, "ada");
  expect(await users.delete(ada.id)).toMatchObject({ sandbox: "ada" });
  expect(await users.bySandbox("ada")).toBeNull();
  expect(await users.delete(ada.id)).toBeNull();
  await expect(users.create({ email: "eve@example.com", sandbox: "ada" })).rejects.toEqual(
    rejectsWith(ErrorCode.Conflict),
  );
  const again = await users.create({ email: "ada@example.com", sandbox: "ada-2" });
  expect(again.id).not.toBe(ada.id);
  expect(again.installationId).toBeNull();
});

test("each user has at most one installation, and an installation belongs to one user", async () => {
  const users = store();
  const ada = await users.create({ email: "ada@example.com", sandbox: "ada" });
  const bob = await users.create({ email: "bob@example.com", sandbox: "bob" });
  await users.setInstallation(ada.id, 7, "ada");
  await users.setInstallation(ada.id, 8, "ada-org");
  expect((await users.byId(ada.id))?.installationId).toBe(8);

  await expect(users.setInstallation(bob.id, 8, null)).rejects.toEqual(
    rejectsWith(ErrorCode.Conflict),
  );
  expect((await users.byId(ada.id))?.installationId).toBe(8);
  expect((await users.byId(bob.id))?.installationId).toBeNull();

  await expect(users.setInstallation("missing", 9, null)).rejects.toEqual(
    rejectsWith(ErrorCode.NotFound),
  );
  await users.clearInstallation(ada.id);
  expect((await users.byId(ada.id))?.installationId).toBeNull();
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
