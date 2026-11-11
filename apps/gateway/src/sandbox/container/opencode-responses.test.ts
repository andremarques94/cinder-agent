import * as v from "valibot";
import { expect, test } from "vite-plus/test";

import { PairingCodeSchema, ServerInfoSchema } from "./opencode-responses.ts";

test("a pairing code from OpenCode becomes our camelCase shape", () => {
  expect(v.parse(PairingCodeSchema, { code: "abc_123-XYZ", expires_in: 300 })).toEqual({
    code: "abc_123-XYZ",
    expiresIn: 300,
  });
});

test("malformed pairing responses are rejected", () => {
  for (const bad of [
    {},
    { code: "", expires_in: 300 },
    { code: "abc", expires_in: 0 },
    { code: "abc", expires_in: 1.5 },
    { code: 123, expires_in: 300 },
    "not an object",
    null,
  ]) {
    expect(v.is(PairingCodeSchema, bad)).toBe(false);
  }
});

test("server info needs a non-empty version", () => {
  expect(v.is(ServerInfoSchema, { version: "2.2.7", pid: 1 })).toBe(true);
  expect(v.is(ServerInfoSchema, { version: "" })).toBe(false);
  expect(v.is(ServerInfoSchema, { pid: 1 })).toBe(false);
});
