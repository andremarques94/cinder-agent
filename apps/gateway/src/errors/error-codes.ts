import { HttpStatus } from "@/http";

export const ErrorCode = {
  Unauthorized: "unauthorized",
  NotFound: "not_found",
  SandboxNotConfigured: "sandbox_not_configured",
  SandboxStartFailed: "sandbox_start_failed",
  SandboxStartTimeout: "sandbox_start_timeout",
  SandboxNotResponding: "sandbox_not_responding",
  SandboxUnavailable: "sandbox_unavailable",
  SandboxRestoreFailed: "sandbox_restore_failed",
  SandboxSaveFailed: "sandbox_save_failed",
  GithubUnavailable: "github_unavailable",
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
  sandbox_restore_failed: {
    status: HttpStatus.ServiceUnavailable,
    message: "Your OpenCode sandbox's saved files could not be restored.",
  },
  sandbox_save_failed: {
    status: HttpStatus.ServiceUnavailable,
    message: "Your OpenCode sandbox could not be saved, so it was left running.",
  },
  github_unavailable: {
    status: HttpStatus.BadGateway,
    message: "GitHub did not accept the app's credentials.",
  },
  internal: { status: HttpStatus.InternalServerError, message: "Something went wrong." },
};
