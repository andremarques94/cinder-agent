import { expect, test } from "vite-plus/test";

import { authorizeGithubRequest } from "./outbound.ts";

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
