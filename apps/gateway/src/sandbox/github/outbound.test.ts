import { describe, expect, test } from "vite-plus/test";

import { authorizeGithubRequest, pickInstallation, repositoryOwner } from "./outbound.ts";

const token = async () => "ghs_real";
const BASIC = `Basic ${btoa("x-access-token:ghs_real")}`;

async function authorization(url: string, init?: RequestInit) {
  const request = await authorizeGithubRequest(new Request(url, init), token);
  return request.headers.get("authorization");
}

describe("given an installation token", () => {
  test.each([
    ["https://github.com/me/repo.git/info/refs?service=git-receive-pack", "GET"],
    ["https://github.com/me/repo/git-upload-pack", "POST"],
  ])("when git calls %s, then it gets the token as basic auth", async (url, method) => {
    const header = await authorization(url, { method });

    expect(header).toBe(BASIC);
  });

  test("when the API is called with the placeholder, then it gets the token as a bearer token", async () => {
    const init = { method: "POST", headers: { authorization: "token cinder-placeholder" } };

    const header = await authorization("https://api.github.com/repos/me/repo/pulls", init);

    expect(header).toBe("Bearer ghs_real");
  });

  test.each([
    "https://github.com/me/repo",
    "https://github.com/login/oauth/access_token",
    "http://api.github.com/user",
    "https://api.github.com.evil.dev/user",
  ])("when %s is called, then it never gets the token", async (url) => {
    const header = await authorization(url, { headers: { authorization: "Bearer mine" } });

    expect(header).toBeNull();
  });

  test("when a request with a body is authorized, then its method and body are kept", async () => {
    const request = new Request("https://api.github.com/graphql", { method: "POST", body: "{}" });

    const authorized = await authorizeGithubRequest(request, token);

    expect(authorized.method).toBe("POST");
    expect(await authorized.text()).toBe("{}");
  });
});

describe("given no installation", () => {
  test("when the API is called, then it goes out with no token", async () => {
    const request = new Request("https://api.github.com/repos/me/repo", {
      headers: { authorization: "token cinder-placeholder" },
    });

    const authorized = await authorizeGithubRequest(request, async () => null);

    expect(authorized.headers.get("authorization")).toBeNull();
  });
});

describe("given requests to GitHub", () => {
  test("when they are authorized, then the token is asked for with the URL's repository owner", async () => {
    const owners: (string | null)[] = [];
    const tokenFor = async (owner: string | null) => {
      owners.push(owner);
      return "ghs_real";
    };
    const urls = [
      "https://github.com/Ada/repo.git/info/refs?service=git-upload-pack",
      "https://api.github.com/repos/ada-org/repo/pulls",
      "https://api.github.com/repos/ada-org/repo",
      "https://api.github.com/graphql",
      "https://api.github.com/user",
      "https://github.com/ada/repo",
    ];

    for (const url of urls) {
      await authorizeGithubRequest(new Request(url), tokenFor);
    }

    expect(owners).toEqual(["ada", "ada-org", "ada-org", null, null]);
  });

  test.each([
    ["https://github.com/Ada/r/git-receive-pack", "ada"],
    ["https://api.github.com/repos/Org/r/issues/1", "org"],
    ["https://api.github.com/repos/org", null],
    ["https://api.github.com/orgs/org/repos", null],
    ["https://github.com/org/r/pulls", null],
  ])("when the owner of %s is read, then it is %s", (url, owner) => {
    const read = repositoryOwner(new URL(url));

    expect(read).toBe(owner);
  });
});

describe("given installations on ada-org, Ada and an unknown account", () => {
  const installations = [
    { installationId: 1, accountLogin: "ada-org" },
    { installationId: 2, accountLogin: "Ada" },
    { installationId: 3, accountLogin: null },
  ];

  test.each([
    ["ada-org", "ada", 1],
    ["ada", null, 2],
    ["someone-else", "ada", 2],
    [null, "ada", 2],
    [null, null, 1],
    ["someone-else", "nobody", 1],
  ])(
    "when the owner is %s and the user is %s, then installation %i is picked",
    (owner, ownLogin, expected) => {
      const picked = pickInstallation(installations, owner, ownLogin);

      expect(picked).toBe(expected);
    },
  );

  test("when there are no installations, then none is picked", () => {
    const picked = pickInstallation([], "ada", "ada");

    expect(picked).toBeNull();
  });
});
