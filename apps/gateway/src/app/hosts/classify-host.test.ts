import { describe, expect, test } from "vite-plus/test";

import { classifyHost } from "./classify-host.ts";

const classify = (url: string, domain = "example.com") =>
  classifyHost(new URL(url).hostname, domain);

describe("given the domain example.com", () => {
  test.each([
    ["https://me.example.com/", "me"],
    ["https://ada.example.com/api/event", "ada"],
    ["https://ME.Example.COM/", "me"],
  ])("when %s is classified, then it is the sandbox %s", (url, name) => {
    const target = classify(url);

    expect(target).toEqual({ kind: "sandbox", name });
  });

  test.each(["https://app.example.com/", "https://APP.example.com/api/me"])(
    "when %s is classified, then it is the signed-in app",
    (url) => {
      const target = classify(url);

      expect(target).toEqual({ kind: "app" });
    },
  );

  test.each([
    "https://ada.me.example.com/",
    "https://ada.app.example.com/",
    "https://api.example.com/",
    "https://www.example.com/",
    "https://admin.example.com/",
    "https://-x.example.com/",
    "https://xn--x-.example.com/",
  ])("when the nested, reserved or malformed %s is classified, then it is unknown", (url) => {
    const target = classify(url);

    expect(target).toEqual({ kind: "unknown-sandbox" });
  });

  test.each([
    "https://gw.acct.workers.dev/",
    "https://me.example.com.evil.test/",
    "https://meexample.com/",
    "https://example.com/",
  ])("when %s is classified, then it is the gateway", (url) => {
    const target = classify(url);

    expect(target).toEqual({ kind: "gateway" });
  });
});

describe("given local development on localhost", () => {
  test.each([
    ["http://me.localhost:8787/", { kind: "sandbox", name: "me" }],
    ["http://app.localhost:8787/", { kind: "app" }],
  ])("when %s is classified, then the port is ignored", (url, expected) => {
    const target = classify(url, "localhost");

    expect(target).toEqual(expected);
  });
});
