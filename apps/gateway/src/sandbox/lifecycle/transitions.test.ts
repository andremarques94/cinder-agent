import { describe, expect, test } from "vite-plus/test";

import { Transitions } from "./transitions.ts";

interface Results extends Record<string, unknown> {
  start: number;
  stop: undefined;
}

function setup() {
  const order: string[] = [];
  const transitions = new Transitions<Results>();
  const step = (name: string) => async () => {
    order.push(`${name} began`);
    await Promise.resolve();
    order.push(`${name} ended`);
    return undefined;
  };
  return { order, transitions, step };
}

describe("given no transition running", () => {
  test("when a start and a stop are asked for, then they run one after the other", async () => {
    const { order, transitions, step } = setup();

    await Promise.all([
      transitions.run("start", async () => {
        await step("start")();
        return 1;
      }),
      transitions.run("stop", step("stop")),
    ]);

    expect(order).toEqual(["start began", "start ended", "stop began", "stop ended"]);
  });

  test("when two starts are asked for, then the second joins the first", async () => {
    const { transitions } = setup();
    let runs = 0;
    const start = async () => ++runs;

    const results = await Promise.all([
      transitions.run("start", start),
      transitions.run("start", start),
    ]);

    expect(results).toEqual([1, 1]);
  });

  test("when a start comes after a queued stop, then it doesn't join the earlier start", async () => {
    const { transitions, step } = setup();
    let runs = 0;
    const start = async () => ++runs;

    const results = await Promise.all([
      transitions.run("start", start),
      transitions.run("stop", step("stop")),
      transitions.run("start", start),
    ]);

    expect([results[0], results[2]]).toEqual([1, 2]);
  });

  test("when a transition fails, then the next one still runs and busy clears", async () => {
    const { transitions, step, order } = setup();

    const failed = transitions.run("start", async () => {
      throw new Error("boom");
    });
    const stop = transitions.run("stop", step("stop"));
    await expect(failed).rejects.toThrow("boom");
    await stop;

    expect(order).toEqual(["stop began", "stop ended"]);
    expect(transitions.busy).toBe(false);
  });
});
