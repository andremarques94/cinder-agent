import { expect, test } from "vite-plus/test";

import { ErrorCode } from "@/lib/errors";

import { accessEmail } from "./access-identity.ts";

const access = (aud: string, identity: unknown) => ({ aud, getIdentity: async () => identity });
const notSignedIn = expect.objectContaining({ code: ErrorCode.NotSignedIn });

test("returns the lowercased email when the audience matches", async () => {
  expect(await accessEmail(access("aud", { email: "Ada@Example.com" }), "aud")).toBe(
    "ada@example.com",
  );
});

test("anything else is not signed in", async () => {
  const cases: [unknown, string | undefined][] = [
    [undefined, "aud"],
    [{}, "aud"],
    [access("other-app", { email: "ada@example.com" }), "aud"],
    [access("aud", { email: "ada@example.com" }), undefined],
    [access("aud", undefined), "aud"],
    [access("aud", { name: "Ada" }), "aud"],
    [access("aud", { email: "not an email" }), "aud"],
  ];
  for (const [context, audience] of cases) {
    await expect(accessEmail(context, audience)).rejects.toEqual(notSignedIn);
  }
});
