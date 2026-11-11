import { HttpStatus } from "@/lib/http";
import { describeError, log } from "@/lib/log";

import { ErrorCode, errorDefinitions, type ErrorStatus } from "./error-codes.ts";
import { GatewayError } from "./gateway-error.ts";

interface PublicError {
  code: ErrorCode;
  status: ErrorStatus;
  message: string;
}

export function publicError(error: unknown): PublicError {
  const gatewayError =
    error instanceof GatewayError ? error : new GatewayError(ErrorCode.Internal, { cause: error });
  const { status, message } = errorDefinitions[gatewayError.code];

  if (status >= HttpStatus.InternalServerError) {
    log.error(gatewayError.code, { ...gatewayError.details, ...describeError(gatewayError.cause) });
  }
  return { code: gatewayError.code, status, message };
}

export function errorResponse(error: unknown): Response {
  const { code, status, message } = publicError(error);
  return Response.json({ error: code, message }, { status });
}
