import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";

import type { AdminContext } from "./admin-env.ts";

export async function requestBody<TSchema extends v.GenericSchema>(
  c: AdminContext,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  const parsed = v.safeParse(schema, await jsonBody(c));
  if (!parsed.success) {
    throw new GatewayError(ErrorCode.InvalidRequest, {
      details: { issues: v.summarize(parsed.issues) },
    });
  }
  return parsed.output;
}

async function jsonBody(c: AdminContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
