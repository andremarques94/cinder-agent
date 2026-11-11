import { expect, test } from "vite-plus/test";

import { WebSocketClose, forwardableCloseCode } from "./websocket-close.ts";

test("reserved close codes are replaced with Normal, others pass through", () => {
  expect(forwardableCloseCode(WebSocketClose.NoStatusReceived)).toBe(WebSocketClose.Normal);
  expect(forwardableCloseCode(WebSocketClose.AbnormalClosure)).toBe(WebSocketClose.Normal);
  expect(forwardableCloseCode(WebSocketClose.InternalError)).toBe(WebSocketClose.InternalError);
  expect(forwardableCloseCode(4000)).toBe(4000);
});
