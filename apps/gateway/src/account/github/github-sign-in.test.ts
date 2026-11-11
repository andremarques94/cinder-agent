import { expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";

import { githubSignIn } from "./github-sign-in.ts";

const config = { slug: "cinder-agent", clientId: "client-id", clientSecret: "secret" };

const installation = (id: number) => ({
  id,
  account: { id, login: `account-${id}`, type: "User" },
});

test("installations reads every page", async () => {
  const pages: string[] = [];
  const github = githubSignIn(config, async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    pages.push(url.searchParams.get("page") ?? "");
    const page = Number(url.searchParams.get("page"));
    const ids = page === 1 ? Array.from({ length: 100 }, (_, i) => i + 1) : [101, 102];
    return Response.json({ total_count: 102, installations: ids.map(installation) });
  });
  const all = await github.installations("ghu_user");
  expect(all).toHaveLength(102);
  expect(all.at(-1)).toEqual(installation(102));
  expect(pages).toEqual(["1", "2"]);
});

test("an unexpected response is a sign-in failure", async () => {
  const github = githubSignIn(config, async () => Response.json({ login: 42 }));
  await expect(github.user("ghu_user")).rejects.toEqual(
    expect.objectContaining({ code: ErrorCode.GithubSignInFailed }),
  );
  const down = githubSignIn(config, async () => new Response("", { status: 500 }));
  await expect(down.isOrgAdmin("ghu_user", "org")).rejects.toEqual(
    expect.objectContaining({ code: ErrorCode.GithubSignInFailed }),
  );
});
