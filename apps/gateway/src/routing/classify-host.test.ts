import { expect, test } from "vite-plus/test";

import { classifyHost, type HostConfig } from "./classify-host.ts";

const config: HostConfig = { sandboxDomain: "example.com", sandboxes: new Set(["me", "ada"]) };
const classify = (url: string) => classifyHost(new URL(url).hostname, config);

test("a subdomain reaches only the sandbox with the same name", () => {
  expect(classify("https://me.example.com/")).toEqual({ kind: "sandbox", name: "me" });
  expect(classify("https://ada.example.com/api/event")).toEqual({ kind: "sandbox", name: "ada" });
});

test("hostnames are case-insensitive (URL lowercases them)", () => {
  expect(classify("https://ME.Example.COM/")).toEqual({ kind: "sandbox", name: "me" });
});

test("unknown, nested and reserved names under the sandbox domain stay out of the gateway", () => {
  for (const url of [
    "https://bob.example.com/",
    "https://ada.me.example.com/",
    "https://app.example.com/",
  ]) {
    expect(classify(url)).toEqual({ kind: "unknown-sandbox" });
  }
});

test("other hostnames, including look-alikes, are the gateway", () => {
  expect(classify("https://gw.acct.workers.dev/")).toEqual({ kind: "gateway" });
  expect(classify("https://me.example.com.evil.test/")).toEqual({ kind: "gateway" });
  expect(classify("https://example.com/")).toEqual({ kind: "gateway" });
});

test("works with *.localhost in local dev, including a port", () => {
  const local = { ...config, sandboxDomain: "localhost" };
  expect(classifyHost(new URL("http://me.localhost:8787/").hostname, local)).toEqual({
    kind: "sandbox",
    name: "me",
  });
});
