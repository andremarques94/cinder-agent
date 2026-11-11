import { describe, expect, test } from "vite-plus/test";

import { sandboxOrigin } from "./hostnames.ts";

describe("given a request to the gateway", () => {
  test.each([
    ["example.com", "https://gw.acct.workers.dev/x", "https://me.example.com"],
    ["localhost", "http://localhost:8787/x", "http://me.localhost:8787"],
  ])(
    "when the sandbox origin under %s is built from %s, then it keeps the scheme and port",
    (domain, request, origin) => {
      const built = sandboxOrigin("me", domain, new URL(request));

      expect(built).toBe(origin);
    },
  );
});
