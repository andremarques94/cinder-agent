# Agent guide

cinder-agent runs one OpenCode server per sandbox in a Cloudflare container, behind a Hono
gateway Worker. Start with [README.md](README.md) (what it is, architecture) and
[CONTRIBUTING.md](CONTRIBUTING.md) (branches, commits, pull requests).

Plans, reviews and explorations live in `docs/`, which is gitignored and exists only on the
owner's machine. When it's there, read `docs/PLAN.md` (milestones and decisions) and
`docs/architecture.md` (how the code works today) before changing behaviour, and keep them up to
date. Never link to `docs/` from tracked files.

## Layout

- `apps/gateway/`: the Worker. Its [README](apps/gateway/README.md) lists the folders and the
  code rules. Follow them; `vp check` enforces most.
- `sandbox/`: container image (`Dockerfile`, `start.sh`, `pause.sh`, baked-in `opencode.json`).
- `scripts/smoke.sh`: end-to-end check against `vp run dev`.
- `DESIGN.md`: the dashboard's design system. Read it before changing anything under
  `apps/gateway/src/account/`.

## Commands

`vp` is installed per project. If it isn't on your `PATH`, use `node_modules/.bin/vp`.

| Command                      | What it does                                                           |
| ---------------------------- | ---------------------------------------------------------------------- |
| `vp install`                 | Install dependencies and the git hooks                                 |
| `vp run ready`               | Format check, lint, types, knip, tests                                 |
| `vp check --fix`             | Format and fix lint issues                                             |
| `vp run dev`                 | Local D1 tables, then gateway + containers on port 8787 (needs Docker) |
| `scripts/smoke.sh`           | Invite `me`, check the dev server end to end, then stop and wake it    |
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
  Given/When/Then tests. Comments only for TODOs, doc links, and a short "why" for non-obvious ordering or recovery rules.

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

---

<!-- fallow:setup-hooks:start -->

## Fallow checks

Use fallow for code-quality, cleanup, and setup tasks in this repository. Fallow checks the changed code before each `git commit` and `git push`. In Claude Code and Codex, a PreToolUse hook from `fallow agent install` runs this check and blocks the command when the verdict is `fail`. Other agents run the check themselves: `fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before you try again. A JSON runtime error such as `{ "error": true, ... }` does not block.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to...                                        | Run                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| delete an "unused" export or file                                    | `fallow dead-code --trace <file>:<export>`                                                                                                                    |
| prove a TypeScript symbol's exact consumers before refactoring       | `fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>`                                                                               |
| find how one module reaches another                                  | `fallow trace --path <from> <to>` (Reports `reachable: false` instead of failing when no import path exists; type-only hops are reported, not skipped.)       |
| delete an "unused" dependency                                        | `fallow dead-code --trace-dependency <name>`                                                                                                                  |
| migrate a dependency                                                 | `fallow trace --dependency <name> --sites` (Counts each imported name, follows one hop through project wrappers, and counts each use that it cannot resolve.) |
| commit or open a PR                                                  | `fallow audit --base <ref>`                                                                                                                                   |
| read a diff before approving it                                      | `fallow review --base <ref> --brief` (orientation, never gates: deterministic and always exit 0, unlike the audit row)                                        |
| prioritize refactoring                                               | `fallow health --hotspots --targets`                                                                                                                          |
| ask who owns code                                                    | `fallow health --ownership`                                                                                                                                   |
| check untested-but-reachable code                                    | `fallow health --coverage-gaps`                                                                                                                               |
| consolidate duplication                                              | `fallow dupes --trace dup:<fingerprint>`                                                                                                                      |
| find feature flags                                                   | `fallow flags`                                                                                                                                                |
| check which architecture rules apply to a file before changing it    | `fallow guard <files>`                                                                                                                                        |
| check import cycles, boundaries and policy rules after changing code | `fallow architecture`                                                                                                                                         |
| surface security candidates                                          | `fallow security`                                                                                                                                             |
| understand a finding                                                 | `fallow explain <issue-type>`                                                                                                                                 |
| scope a monorepo                                                     | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command)                                                                          |

<!-- fallow:setup-hooks:end -->
