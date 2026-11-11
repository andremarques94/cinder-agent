import { HttpStatus } from "@/lib/http";

export const ErrorCode = {
  Unauthorized: "unauthorized",
  NotSignedIn: "not_signed_in",
  NotInvited: "not_invited",
  CrossSiteRequest: "cross_site_request",
  InvalidRequest: "invalid_request",
  NotFound: "not_found",
  Conflict: "conflict",
  SandboxNotConfigured: "sandbox_not_configured",
  SandboxStartFailed: "sandbox_start_failed",
  SandboxStartTimeout: "sandbox_start_timeout",
  SandboxNotResponding: "sandbox_not_responding",
  SandboxUnavailable: "sandbox_unavailable",
  SandboxRestoreFailed: "sandbox_restore_failed",
  SandboxSaveFailed: "sandbox_save_failed",
  GithubUnavailable: "github_unavailable",
  GithubSignInNotConfigured: "github_sign_in_not_configured",
  GithubStateMismatch: "github_state_mismatch",
  GithubSignInFailed: "github_sign_in_failed",
  GithubAccountTaken: "github_account_taken",
  Internal: "internal",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type ErrorStatus = Exclude<
  HttpStatus,
  | typeof HttpStatus.SwitchingProtocols
  | typeof HttpStatus.Created
  | typeof HttpStatus.NoContent
  | typeof HttpStatus.SeeOther
>;

interface ErrorDefinition {
  status: ErrorStatus;
  message: string;
}

export const errorDefinitions: Record<ErrorCode, ErrorDefinition> = {
  unauthorized: { status: HttpStatus.Unauthorized, message: "Missing or invalid admin token." },
  not_signed_in: {
    status: HttpStatus.Unauthorized,
    message: "Sign in through Cloudflare Access first.",
  },
  not_invited: {
    status: HttpStatus.Forbidden,
    message: "Your account has not been invited. Ask the admin for an invite.",
  },
  cross_site_request: {
    status: HttpStatus.Forbidden,
    message: "Requests from other sites are not allowed.",
  },
  invalid_request: { status: HttpStatus.BadRequest, message: "The request is not valid." },
  not_found: { status: HttpStatus.NotFound, message: "Not found." },
  conflict: {
    status: HttpStatus.Conflict,
    message: "That email, sandbox name or installation is already taken.",
  },
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
  github_sign_in_not_configured: {
    status: HttpStatus.NotFound,
    message: "GitHub sign-in is not set up on this gateway.",
  },
  github_state_mismatch: {
    status: HttpStatus.BadRequest,
    message: "The GitHub sign-in expired or came from another browser. Start again.",
  },
  github_sign_in_failed: {
    status: HttpStatus.BadGateway,
    message: "GitHub sign-in did not complete. Start again.",
  },
  github_account_taken: {
    status: HttpStatus.Conflict,
    message: "That GitHub account is already linked to another user.",
  },
  internal: { status: HttpStatus.InternalServerError, message: "Something went wrong." },
};
