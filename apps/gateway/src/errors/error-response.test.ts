import { afterEach, expect, test, vi } from "vite-plus/test";

import { ErrorCode } from "./error-codes.ts";
import { errorResponse } from "./error-response.ts";
import { GatewayError } from "./gateway-error.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

test("a GatewayError becomes its status, code and fixed message", async () => {
  const response = errorResponse(new GatewayError(ErrorCode.NotFound));
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "not_found", message: "Not found." });
});

test("anything else is an internal error that never leaks its message", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = errorResponse(new Error("database password is hunter2"));

  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("hunter2");
  expect(logged).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "internal",
      error: "Error: database password is hunter2",
    }),
  );
});

test("server errors are logged with their details, client errors are not", () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});

  errorResponse(new GatewayError(ErrorCode.Unauthorized));
  expect(logged).not.toHaveBeenCalled();

  errorResponse(
    new GatewayError(ErrorCode.SandboxStartTimeout, { details: { timeoutMs: 60_000 } }),
  );
  expect(logged).toHaveBeenCalledWith(
    expect.objectContaining({ level: "error", event: "sandbox_start_timeout", timeoutMs: 60_000 }),
  );
});
