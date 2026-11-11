import { describe, expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";

import { githubSignIn } from "./github-sign-in.ts";

const config = { slug: "cinder-agent", clientId: "client-id", clientSecret: "secret" };
const signInFailed = expect.objectContaining({ code: ErrorCode.GithubSignInFailed });

const installation = (id: number) => ({
  id,
  account: { id, login: `account-${id}`, type: "User" },
});

describe("given a user with 102 installations", () => {
  test("when the installations are listed, then every page is read", async () => {
    const pages: string[] = [];
    const github = githubSignIn(config, async (input) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const page = url.searchParams.get("page") ?? "";
      pages.push(page);
      const ids = page === "1" ? Array.from({ length: 100 }, (_, i) => i + 1) : [101, 102];
      return Response.json({ total_count: 102, installations: ids.map(installation) });
    });

    const all = await github.installations("ghu_user");

    expect(all).toHaveLength(102);
    expect(all.at(-1)).toEqual(installation(102));
    expect(pages).toEqual(["1", "2"]);
  });
});

describe("given GitHub answers unexpectedly", () => {
  test("when the user is read from a malformed response, then it is a sign-in failure", async () => {
    const github = githubSignIn(config, async () => Response.json({ login: 42 }));

    const user = github.user("ghu_user");

    await expect(user).rejects.toEqual(signInFailed);
  });

  test("when the org membership check gets a server error, then it is a sign-in failure", async () => {
    const github = githubSignIn(config, async () => new Response("", { status: 500 }));

    const admin = github.isOrgAdmin("ghu_user", "org");

    await expect(admin).rejects.toEqual(signInFailed);
  });
});
