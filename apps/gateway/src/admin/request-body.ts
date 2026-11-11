import * as v from "valibot";

import { ErrorCode, GatewayError } from "@/lib/errors";

import type { AdminContext } from "./admin-env.ts";

export async function requestBody<TSchema extends v.GenericSchema>(
  c: AdminContext,
  schema: TSchema,
): Promise<v.InferOutput<TSchema>> {
  const json: unknown = await c.req.json().catch(() => undefined);
  const parsed = v.safeParse(schema, json);
  if (!parsed.success) {
    throw new GatewayError(ErrorCode.InvalidRequest, {
      details: { issues: v.summarize(parsed.issues) },
    });
  }
  return parsed.output;
}
