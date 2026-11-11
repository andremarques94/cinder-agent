export const WebSocketClose = {
  Normal: 1000,
  NoStatusReceived: 1005,
  AbnormalClosure: 1006,
  InternalError: 1011,
} as const;

const reservedCodes = new Set<number>([
  WebSocketClose.NoStatusReceived,
  WebSocketClose.AbnormalClosure,
]);

export function forwardableCloseCode(code: number): number {
  return reservedCodes.has(code) ? WebSocketClose.Normal : code;
}
