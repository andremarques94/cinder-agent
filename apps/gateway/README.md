# gateway

```
src/
  index.ts    Worker entry; the only file that touches Cloudflare bindings
  app/        Hono app: sandbox hostnames → sandbox, everything else → /admin
  admin/      Admin API: pair, status, stop
  routing/    Hostname → sandbox
  sandbox/    Durable Object, container lifecycle and outbound handlers, one per sandbox
  github/     GitHub App tokens and which outbound requests get them
  config/     wrangler.jsonc vars, validated with valibot
  errors/     Error codes, statuses and messages; errorResponse()
  log/        Logging
  http/       HTTP status and WebSocket close codes
```

Rules:

- Import other folders through their `index.ts` with `@/name`; use `./file.ts` inside a folder.
- Only `index.ts` and `sandbox/` use the Workers runtime. Everything else is tested with `vp test`.
- No type casts (`as`, `!`), braces on every `if`, sorted imports. `vp check` enforces these.
- Validate outside data with valibot.
- Throw `GatewayError(ErrorCode.X)`, log with `log`, use `HttpStatus` and `WebSocketClose`.
- Comments only for TODOs and links to the docs code was taken from.
- OpenCode is pinned in `sandbox/Dockerfile` and `pnpm-workspace.yaml`; update both together.
