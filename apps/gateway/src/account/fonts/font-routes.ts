import { Hono } from "hono";

import { ErrorCode, GatewayError } from "@/lib/errors";
import { CACHE_CONTROL, HttpStatus } from "@/lib/http";

import type { AccountEnv } from "../account-env.ts";

export const FONT_PATH = "/fonts/inter.woff2";

const ONE_DAY_SECONDS = 86_400;

// https://github.com/rsms/inter (SIL Open Font License 1.1)
export const fontRoutes = new Hono<AccountEnv>().get(FONT_PATH, (c) => {
  const font = c.var.font;
  if (!font) {
    throw new GatewayError(ErrorCode.NotFound);
  }
  return c.body(font, HttpStatus.Ok, {
    "content-type": "font/woff2",
    [CACHE_CONTROL]: `private, max-age=${ONE_DAY_SECONDS}`,
  });
});
