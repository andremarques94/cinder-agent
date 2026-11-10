import { expect, test } from "vite-plus/test";

import { sandboxOrigin } from "./hostnames.ts";

test("sandboxOrigin keeps the admin request's scheme and port", () => {
  expect(sandboxOrigin("me", "example.com", new URL("https://gw.acct.workers.dev/x"))).toBe(
    "https://me.example.com",
  );
  expect(sandboxOrigin("me", "localhost", new URL("http://localhost:8787/x"))).toBe(
    "http://me.localhost:8787",
  );
});
