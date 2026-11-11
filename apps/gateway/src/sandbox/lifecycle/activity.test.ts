import { describe, expect, test } from "vite-plus/test";

import { Activity } from "./activity.ts";

const MINUTE = 60_000;
const LIMIT = 30 * MINUTE;

function clock() {
  let now = 0;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function streamingResponse() {
  let close = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: 1\n\n"));
      close = () => controller.close();
    },
  });
  return { response: new Response(body, { status: 200 }), close: () => close() };
}

describe("given a sandbox with no open connections", () => {
  test("when less than the limit has passed, then it is not idle", () => {
    const time = clock();
    const activity = new Activity(time.now);

    time.advance(29 * MINUTE);

    expect(activity.isIdle(LIMIT)).toBe(false);
  });

  test("when it is touched, then the limit starts again", () => {
    const time = clock();
    const activity = new Activity(time.now);
    time.advance(29 * MINUTE);

    activity.touch();
    time.advance(29 * MINUTE);

    expect(activity.isIdle(LIMIT)).toBe(false);
    time.advance(MINUTE);
    expect(activity.isIdle(LIMIT)).toBe(true);
  });
});

describe("given an open terminal", () => {
  test("when the limit passes, then the sandbox stays busy until it closes", () => {
    const time = clock();
    const activity = new Activity(time.now);
    const release = activity.hold();

    time.advance(60 * MINUTE);
    const busy = !activity.isIdle(LIMIT);
    release();
    release();
    const busyRightAfterClose = !activity.isIdle(LIMIT);
    time.advance(LIMIT);

    expect(busy).toBe(true);
    expect(busyRightAfterClose).toBe(true);
    expect(activity.isIdle(LIMIT)).toBe(true);
  });
});

describe("given a streamed response", () => {
  test("when the stream is open, then the sandbox stays busy until it ends", async () => {
    const time = clock();
    const activity = new Activity(time.now);
    const stream = streamingResponse();
    const reader = activity.track(stream.response).body?.getReader();
    await reader?.read();

    time.advance(60 * MINUTE);
    const busy = !activity.isIdle(LIMIT);
    stream.close();
    await reader?.read();
    await new Promise((resolve) => setTimeout(resolve, 0));
    time.advance(LIMIT);

    expect(busy).toBe(true);
    expect(activity.isIdle(LIMIT)).toBe(true);
  });

  test("when it is tracked, then its status, headers and body are kept", async () => {
    const activity = new Activity();
    const response = new Response("hi", {
      status: 201,
      headers: { "content-type": "text/plain" },
    });

    const tracked = activity.track(response);

    expect(tracked.status).toBe(201);
    expect(tracked.headers.get("content-type")).toBe("text/plain");
    expect(await tracked.text()).toBe("hi");
  });
});
