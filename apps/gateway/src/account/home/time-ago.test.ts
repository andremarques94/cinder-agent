import { describe, expect, test } from "vite-plus/test";

import { timeAgo } from "./time-ago.ts";

const NOW = Date.parse("2026-11-11T12:00:00Z");

describe("given a time before now", () => {
  test.each([
    ["2026-11-11T11:59:30Z", "just now"],
    ["2026-11-11T11:55:00Z", "5 minutes ago"],
    ["2026-11-11T08:00:00Z", "4 hours ago"],
    ["2026-11-10T12:00:00Z", "yesterday"],
    ["2026-11-01T12:00:00Z", "10 days ago"],
  ])("when %s is shown, then it reads %s", (iso, expected) => {
    const shown = timeAgo(iso, NOW);

    expect(shown).toBe(expected);
  });
});
