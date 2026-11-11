import { expect, test } from "vite-plus/test";

import { authorizeGithubRequest, pickInstallation, repositoryOwner } from "./outbound.ts";

const token = async () => "ghs_real";

async function authorization(url: string, init?: RequestInit) {
  const request = await authorizeGithubRequest(new Request(url, init), token);
  return request.headers.get("authorization");
}

test("git smart HTTP on github.com gets the token as basic auth", async () => {
  const basic = `Basic ${btoa("x-access-token:ghs_real")}`;
  expect(
    await authorization("https://github.com/me/repo.git/info/refs?service=git-receive-pack"),
  ).toBe(basic);
  expect(
    await authorization("https://github.com/me/repo/git-upload-pack", { method: "POST" }),
  ).toBe(basic);
});

test("api.github.com gets the token as a bearer token, replacing the placeholder", async () => {
  expect(
    await authorization("https://api.github.com/repos/me/repo/pulls", {
      method: "POST",
      headers: { authorization: "token cinder-placeholder" },
    }),
  ).toBe("Bearer ghs_real");
});

test("other requests never get the token", async () => {
  for (const url of [
    "https://github.com/me/repo",
    "https://github.com/login/oauth/access_token",
    "http://api.github.com/user",
    "https://api.github.com.evil.dev/user",
  ]) {
    expect(await authorization(url, { headers: { authorization: "Bearer mine" } })).toBeNull();
  }
});

test("the request body and method are kept", async () => {
  const request = await authorizeGithubRequest(
    new Request("https://api.github.com/graphql", { method: "POST", body: "{}" }),
    token,
  );
  expect(request.method).toBe("POST");
  expect(await request.text()).toBe("{}");
});

test("without an installation the request goes out with no token", async () => {
  const request = await authorizeGithubRequest(
    new Request("https://api.github.com/repos/me/repo", {
      headers: { authorization: "token cinder-placeholder" },
    }),
    async () => null,
  );
  expect(request.headers.get("authorization")).toBeNull();
});

test("the token is asked for with the repository owner from the URL", async () => {
  const owners: (string | null)[] = [];
  const tokenFor = async (owner: string | null) => {
    owners.push(owner);
    return "ghs_real";
  };
  for (const url of [
    "https://github.com/Ada/repo.git/info/refs?service=git-upload-pack",
    "https://api.github.com/repos/ada-org/repo/pulls",
    "https://api.github.com/repos/ada-org/repo",
    "https://api.github.com/graphql",
    "https://api.github.com/user",
    "https://github.com/ada/repo",
  ]) {
    await authorizeGithubRequest(new Request(url), tokenFor);
  }
  expect(owners).toEqual(["ada", "ada-org", "ada-org", null, null]);
});

test("repositoryOwner reads only git and /repos paths", () => {
  expect(repositoryOwner(new URL("https://github.com/Ada/r/git-receive-pack"))).toBe("ada");
  expect(repositoryOwner(new URL("https://api.github.com/repos/Org/r/issues/1"))).toBe("org");
  expect(repositoryOwner(new URL("https://api.github.com/repos/org"))).toBeNull();
  expect(repositoryOwner(new URL("https://api.github.com/orgs/org/repos"))).toBeNull();
  expect(repositoryOwner(new URL("https://github.com/org/r/pulls"))).toBeNull();
});

test("pickInstallation: the owner's installation, else the user's own account, else the oldest", () => {
  const installations = [
    { installationId: 1, accountLogin: "ada-org" },
    { installationId: 2, accountLogin: "Ada" },
    { installationId: 3, accountLogin: null },
  ];
  expect(pickInstallation(installations, "ada-org", "ada")).toBe(1);
  expect(pickInstallation(installations, "ada", null)).toBe(2);
  expect(pickInstallation(installations, "someone-else", "ada")).toBe(2);
  expect(pickInstallation(installations, null, "ada")).toBe(2);
  expect(pickInstallation(installations, null, null)).toBe(1);
  expect(pickInstallation(installations, "someone-else", "nobody")).toBe(1);
  expect(pickInstallation([], "ada", "ada")).toBeNull();
});
