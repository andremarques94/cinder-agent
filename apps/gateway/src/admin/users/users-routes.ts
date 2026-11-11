import { Hono } from "hono";
import * as v from "valibot";

import { HttpStatus } from "@/lib/http";
import { callSandbox } from "@/sandbox";
import { SandboxNameSchema } from "@/users";

import type { AdminEnv } from "../admin-env.ts";
import { requestBody } from "../request-body.ts";
import { githubRoutes } from "./github-routes.ts";
import { requireUser } from "./require-user.ts";

const NewUserSchema = v.object({
  email: v.pipe(v.string(), v.trim(), v.email(), v.toLowerCase()),
  sandbox: SandboxNameSchema,
});

export const usersRoutes = new Hono<AdminEnv>()
  .get("/", async (c) => {
    const [users, installations] = await Promise.all([
      c.var.users.list(),
      c.var.users.allInstallations(),
    ]);
    return c.json(
      users.map((user) => ({
        ...user,
        installationIds: installations
          .filter((installation) => installation.userId === user.id)
          .map((installation) => installation.installationId),
      })),
    );
  })

  .post("/", async (c) => {
    const user = await c.var.users.create(await requestBody(c, NewUserSchema));
    return c.json(user, HttpStatus.Created);
  })

  .delete("/:id", async (c) => {
    const user = await requireUser(c);
    await callSandbox(user.sandbox, () => c.var.sandboxes.get(user.id).destroy());
    await c.var.users.delete(user.id);
    return c.body(null, HttpStatus.NoContent);
  })

  .route("/:id/github", githubRoutes);
