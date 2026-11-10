import { HttpStatus } from "@/http";

export const ErrorCode = {
  Unauthorized: "unauthorized",
  NotFound: "not_found",
  SandboxNotConfigured: "sandbox_not_configured",
  SandboxStartFailed: "sandbox_start_failed",
  SandboxStartTimeout: "sandbox_start_timeout",
  SandboxNotResponding: "sandbox_not_responding",
  SandboxUnavailable: "sandbox_unavailable",
  Internal: "internal",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

interface ErrorDefinition {
  status: HttpStatus;
  message: string;
}

export const errorDefinitions: Record<ErrorCode, ErrorDefinition> = {
  unauthorized: { status: HttpStatus.Unauthorized, message: "Missing or invalid admin token." },
  not_found: { status: HttpStatus.NotFound, message: "Not found." },
  sandbox_not_configured: {
    status: HttpStatus.InternalServerError,
    message: "No container is configured for this sandbox.",
  },
  sandbox_start_failed: {
    status: HttpStatus.ServiceUnavailable,
    message: "Your OpenCode sandbox did not start. Try again in a moment.",
  },
  sandbox_start_timeout: {
    status: HttpStatus.ServiceUnavailable,
    message: "Your OpenCode sandbox is taking too long to start. Try again in a moment.",
  },
  sandbox_not_responding: {
    status: HttpStatus.BadGateway,
    message: "Your OpenCode sandbox is not responding.",
  },
  sandbox_unavailable: {
    status: HttpStatus.ServiceUnavailable,
    message: "The sandbox is unavailable.",
  },
  internal: { status: HttpStatus.InternalServerError, message: "Something went wrong." },
};
