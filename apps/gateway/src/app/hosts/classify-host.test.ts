import { expect, test } from "vite-plus/test";

import { classifyHost } from "./classify-host.ts";

const classify = (url: string) => classifyHost(new URL(url).hostname, "example.com");

test("a single label under the domain names a sandbox", () => {
  expect(classify("https://me.example.com/")).toEqual({ kind: "sandbox", name: "me" });
  expect(classify("https://ada.example.com/api/event")).toEqual({ kind: "sandbox", name: "ada" });
});

test("hostnames are case-insensitive (URL lowercases them)", () => {
  expect(classify("https://ME.Example.COM/")).toEqual({ kind: "sandbox", name: "me" });
});

test("app is the signed-in app, not a sandbox", () => {
  expect(classify("https://app.example.com/")).toEqual({ kind: "app" });
  expect(classify("https://APP.example.com/api/me")).toEqual({ kind: "app" });
});

test("nested, reserved and malformed names under the domain stay out of the gateway", () => {
  for (const url of [
    "https://ada.me.example.com/",
    "https://ada.app.example.com/",
    "https://api.example.com/",
    "https://www.example.com/",
    "https://admin.example.com/",
    "https://-x.example.com/",
    "https://xn--x-.example.com/",
  ]) {
    expect(classify(url)).toEqual({ kind: "unknown-sandbox" });
  }
});

test("other hostnames, including look-alikes, are the gateway", () => {
  expect(classify("https://gw.acct.workers.dev/")).toEqual({ kind: "gateway" });
  expect(classify("https://me.example.com.evil.test/")).toEqual({ kind: "gateway" });
  expect(classify("https://meexample.com/")).toEqual({ kind: "gateway" });
  expect(classify("https://example.com/")).toEqual({ kind: "gateway" });
});

test("works with *.localhost in local dev, including a port", () => {
  expect(classifyHost(new URL("http://me.localhost:8787/").hostname, "localhost")).toEqual({
    kind: "sandbox",
    name: "me",
  });
  expect(classifyHost(new URL("http://app.localhost:8787/").hostname, "localhost")).toEqual({
    kind: "app",
  });
});
