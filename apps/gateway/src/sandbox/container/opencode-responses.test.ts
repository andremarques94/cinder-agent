import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";

import { PairingCodeSchema, ServerInfoSchema } from "./opencode-responses.ts";

describe("given a pairing response from OpenCode", () => {
  test("when it is well formed, then it becomes our camelCase shape", () => {
    const response = { code: "abc_123-XYZ", expires_in: 300 };

    const parsed = v.parse(PairingCodeSchema, response);

    expect(parsed).toEqual({ code: "abc_123-XYZ", expiresIn: 300 });
  });

  test.each([
    {},
    { code: "", expires_in: 300 },
    { code: "abc", expires_in: 0 },
    { code: "abc", expires_in: 1.5 },
    { code: 123, expires_in: 300 },
    "not an object",
    null,
  ])("when it is %j, then it is rejected", (response) => {
    const valid = v.is(PairingCodeSchema, response);

    expect(valid).toBe(false);
  });
});

describe("given a server info response", () => {
  test.each([
    [{ version: "2.2.7", pid: 1 }, true],
    [{ version: "" }, false],
    [{ pid: 1 }, false],
  ])("when it is %j, then valid is %s", (response, expected) => {
    const valid = v.is(ServerInfoSchema, response);

    expect(valid).toBe(expected);
  });
});
