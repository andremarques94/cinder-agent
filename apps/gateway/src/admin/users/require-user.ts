import { ErrorCode, GatewayError } from "@/lib/errors";
import type { User } from "@/users";

import type { AdminContext } from "../admin-env.ts";

export async function requireUser(c: AdminContext): Promise<User> {
  const user = await c.var.users.byId(c.req.param("id") ?? "");
  if (!user) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return user;
}
