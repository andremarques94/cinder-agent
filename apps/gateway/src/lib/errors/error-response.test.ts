import { describe, expect, test, vi } from "vite-plus/test";

import { ErrorCode } from "./error-codes.ts";
import { errorResponse } from "./error-response.ts";
import { GatewayError } from "./gateway-error.ts";

describe("given a GatewayError", () => {
  test("when it becomes a response, then it has its status, code and fixed message", async () => {
    const error = new GatewayError(ErrorCode.NotFound);

    const response = errorResponse(error);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found", message: "Not found." });
  });

  test("when it is a client error, then nothing is logged", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    errorResponse(new GatewayError(ErrorCode.Unauthorized));

    expect(logged).not.toHaveBeenCalled();
  });

  test("when it is a server error, then it is logged with its details", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new GatewayError(ErrorCode.SandboxStartTimeout, {
      details: { timeoutMs: 60_000 },
    });

    errorResponse(error);

    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "error",
        event: "sandbox_start_timeout",
        timeoutMs: 60_000,
      }),
    );
  });
});

describe("given any other error", () => {
  test("when it becomes a response, then it is an internal error that hides its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("database password is hunter2");

    const response = errorResponse(error);

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
    expect(logged).toHaveBeenCalledWith(
      expect.objectContaining({ event: "internal", error: "Error: database password is hunter2" }),
    );
  });
});
