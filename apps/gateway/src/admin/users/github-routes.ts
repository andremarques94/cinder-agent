import { Hono } from "hono";
import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";
import { HttpStatus } from "@/lib/http";

import type { AdminEnv } from "../admin-env.ts";
import { requestBody } from "../request-body.ts";
import { requireUser } from "./require-user.ts";

const InstallationSchema = v.object({
  installationId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  accountLogin: v.optional(v.nullable(v.pipe(v.string(), v.nonEmpty())), null),
});

export const githubRoutes = new Hono<AdminEnv>()
  .put("/", async (c) => {
    const user = await requireUser(c);
    const { installationId, accountLogin } = await requestBody(c, InstallationSchema);
    if (!(await c.var.users.claimInstallation(user.id, installationId, accountLogin))) {
      throw new GatewayError(ErrorCode.Conflict);
    }
    return c.body(null, HttpStatus.NoContent);
  })

  .delete("/", async (c) => {
    const user = await requireUser(c);
    await c.var.users.clearInstallations(user.id);
    return c.body(null, HttpStatus.NoContent);
  });
