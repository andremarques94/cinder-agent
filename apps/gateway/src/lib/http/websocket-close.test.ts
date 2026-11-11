import { describe, expect, test } from "vite-plus/test";

import { WebSocketClose, forwardableCloseCode } from "./websocket-close.ts";

describe("given a close code from the container", () => {
  test.each([WebSocketClose.NoStatusReceived, WebSocketClose.AbnormalClosure])(
    "when the reserved code %i is forwarded, then it becomes Normal",
    (code) => {
      const forwarded = forwardableCloseCode(code);

      expect(forwarded).toBe(WebSocketClose.Normal);
    },
  );

  test.each([WebSocketClose.InternalError, 4000])(
    "when the code %i is forwarded, then it passes through",
    (code) => {
      const forwarded = forwardableCloseCode(code);

      expect(forwarded).toBe(code);
    },
  );
});
