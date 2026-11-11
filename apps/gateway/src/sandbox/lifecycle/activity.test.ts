import { expect, test } from "vite-plus/test";

import { Activity } from "./activity.ts";

const MINUTE = 60_000;

function clock() {
  let now = 0;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

test("idle only after the limit passes without activity", () => {
  const time = clock();
  const activity = new Activity(time.now);

  time.advance(29 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(false);

  activity.touch();
  time.advance(29 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(false);

  time.advance(MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(true);
});

test("an open terminal keeps the sandbox busy until it closes", () => {
  const time = clock();
  const activity = new Activity(time.now);
  const release = activity.hold();

  time.advance(60 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(false);

  release();
  release();
  expect(activity.isIdle(30 * MINUTE)).toBe(false);
  time.advance(30 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(true);
});

test("a streamed response keeps the sandbox busy until the stream ends", async () => {
  const time = clock();
  const activity = new Activity(time.now);
  let close = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: 1\n\n"));
      close = () => controller.close();
    },
  });

  const tracked = activity.track(new Response(body, { status: 200 }));
  const reader = tracked.body?.getReader();
  await reader?.read();

  time.advance(60 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(false);

  close();
  await reader?.read();
  await new Promise((resolve) => setTimeout(resolve, 0));
  time.advance(30 * MINUTE);
  expect(activity.isIdle(30 * MINUTE)).toBe(true);
});

test("tracking keeps the response status and headers", async () => {
  const activity = new Activity();
  const tracked = activity.track(
    new Response("hi", { status: 201, headers: { "content-type": "text/plain" } }),
  );
  expect(tracked.status).toBe(201);
  expect(tracked.headers.get("content-type")).toBe("text/plain");
  expect(await tracked.text()).toBe("hi");
});
