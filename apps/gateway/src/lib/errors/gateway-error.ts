import type { LogFields } from "@/lib/log";

import { errorDefinitions, type ErrorCode } from "./error-codes.ts";

export class GatewayError extends Error {
  override readonly name = "GatewayError";
  readonly code: ErrorCode;
  readonly details: LogFields;

  constructor(code: ErrorCode, options: { cause?: unknown; details?: LogFields } = {}) {
    super(errorDefinitions[code].message, { cause: options.cause });
    this.code = code;
    this.details = options.details ?? {};
  }
}
