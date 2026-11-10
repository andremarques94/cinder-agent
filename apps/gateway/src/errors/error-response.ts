import { HttpStatus } from "@/http";
import { describeError, log } from "@/log";

import { ErrorCode, errorDefinitions } from "./error-codes.ts";
import { GatewayError } from "./gateway-error.ts";

export function errorResponse(error: unknown): Response {
  const gatewayError =
    error instanceof GatewayError ? error : new GatewayError(ErrorCode.Internal, { cause: error });
  const { status, message } = errorDefinitions[gatewayError.code];

  if (status >= HttpStatus.InternalServerError) {
    log.error(gatewayError.code, { ...gatewayError.details, ...describeError(gatewayError.cause) });
  }
  return Response.json({ error: gatewayError.code, message }, { status });
}
