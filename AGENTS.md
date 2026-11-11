# Agent guide

cinder-agent runs one OpenCode server per sandbox in a Cloudflare container, behind a Hono
gateway Worker. Start with [README.md](README.md) (what it is, architecture),
[PLAN.md](PLAN.md) (milestones and decisions) and [CONTRIBUTING.md](CONTRIBUTING.md) (branches,
commits, pull requests).

## Layout

- `apps/gateway/`: the Worker. Its [README](apps/gateway/README.md) lists the folders and the
  code rules. Follow them; `vp check` enforces most.
- `sandbox/`: container image (`Dockerfile`, `start.sh`, baked-in `opencode.json`).
- `scripts/smoke.sh`: end-to-end check against `vp run dev`.

## Commands

`vp` is installed per project. If it isn't on your `PATH`, use `node_modules/.bin/vp`.

| Command                      | What it does                                                           |
| ---------------------------- | ---------------------------------------------------------------------- |
| `vp install`                 | Install dependencies and the git hooks                                 |
| `vp run ready`               | Format check, lint, types, knip, tests                                 |
| `vp check --fix`             | Format and fix lint issues                                             |
| `vp run dev`                 | Local D1 tables, then gateway + containers on port 8787 (needs Docker) |
| `scripts/smoke.sh`           | Invite `me`, then check the running dev server end to end              |
| `vp run gateway#types`       | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `vp run gateway#db:generate` | Generate a D1 migration after changing `src/users/schema.ts`           |

## Before you say you're done

- `vp run ready` passes.
- For changes under `apps/gateway/src/sandbox/` or `sandbox/`, run `vp run dev` and
  `scripts/smoke.sh`. Unit tests don't cover the container.
- Say what you didn't test.

## Rules

- Don't read, print or commit `.dev.vars`, `*.secrets.env` or private keys.
- Don't commit, push or open pull requests unless asked. No AI attribution in commits or PRs.
- Work on a branch from `master` named `<type>/<short-description>`.
- Follow the code style in [CONTRIBUTING.md](CONTRIBUTING.md#code-style), including
  Given/When/Then tests. Comments only for TODOs and links to the docs the code was taken from.

## Gotchas

- `wrangler.jsonc` lists `secrets.required`, so `wrangler dev` only loads the secrets listed
  there from `.dev.vars`. Add new secrets to that list.
- pnpm refuses packages released in the last day. Pin an older version instead of adding
  `minimumReleaseAgeExclude` entries.
- Gitleaks runs on every commit. Test fixtures must not look like secrets: build PEM headers
  and tokens from variables.
- The OpenCode version is pinned in `sandbox/Dockerfile` and `pnpm-workspace.yaml`; change both.
- Git worktrees use the main checkout's hooks, so hook changes only apply once merged.
- Sandboxes use `@cloudflare/sandbox` 1.0: the Durable Object drives `ctx.container` directly and
  the SDK only adds helpers (`DirectoryBackup`). Ignore 0.x examples that use `getSandbox()`.
  Outbound intercepts must be registered before `container.start()`.
- Sandboxes come from D1, not config: invite users with `POST /admin/users`. Locally,
  `app.localhost` signs in as `access.dev` in `wrangler.jsonc`, and `ACCESS_AUD` in `.dev.vars`
  must match its `aud`.
- D1 tables are defined in `apps/gateway/src/users/schema.ts` (Drizzle). After changing it, run
  `vp run gateway#db:generate --name <change>` and add the new migration to the list in
  `apps/gateway/src/testing/sqlite-database.ts`. Migrations go to
  `apps/gateway/src/users/migrations/`; never edit them by hand.
