# Contributing

## Setup

Follow the requirements and local development steps in the [README](README.md). `vp install`
also installs the git hooks: one scans staged files for secrets with Gitleaks, then formats and
checks them; one checks commit messages.

## Branches

Branch from `master` and name the branch `<type>/<short-description>`, using the commit types
below, in lowercase with hyphens:

```
feat/r2-snapshots
fix/websocket-close-code
docs/deploy-steps
```

## Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <summary>
```

| Type       | For                                      |
| ---------- | ---------------------------------------- |
| `feat`     | A new feature (minor release)            |
| `fix`      | A bug fix (patch release)                |
| `docs`     | Documentation only                       |
| `refactor` | Code changes that don't change behaviour |
| `test`     | Tests only                               |
| `perf`     | Performance                              |
| `build`    | Build, dependencies, Docker image        |
| `ci`       | GitHub Actions, Dependabot               |
| `chore`    | Anything else                            |

- Scopes are optional: `gateway`, `sandbox`, `ci`, `deps`.
- Write the summary in the imperative, lowercase, without a trailing period:
  `fix(gateway): keep the original Host header`.
- Mark breaking changes with `!` (`feat!: …`) and explain them in the body.

The `commit-msg` hook rejects messages that don't follow this.

## Pull requests

- Keep one change per pull request.
- Use a commit-style title. Pull requests are squash-merged, so the title becomes the commit
  message.
- `vp run ready` (checks, knip, tests) must pass. CI runs the same checks, plus Gitleaks on the whole history.
- Follow the [code style](#code-style) and the gateway rules in
  [apps/gateway/README.md](apps/gateway/README.md).

## Code style

`vp check` enforces the rules marked _(lint)_; the rest are for review. Lint rules are in
[vite.config.ts](vite.config.ts).

- No type casts (`as`, `!`), braces on every `if`, sorted imports. _(lint)_
- Return early instead of `else` or `else if`; no nested ternaries. Ternaries are fine for a
  value or in JSX. _(lint: `no-else-return`, `no-lonely-if`, `no-nested-ternary`)_
- Use `switch` for three or more branches on the same value, and for any union type; switches on
  unions must cover every case. _(lint: `switch-exhaustiveness-check`)_ When each branch only maps
  a value to another value, use a lookup object instead.
- Use `async`/`await` and `try`/`catch`/`finally`, not `.then`, `.catch` or `.finally`. Inside
  `try`, `return await` the promise, or its rejection escapes the `catch`. To keep an in-flight
  promise (start once, share with every caller), store the promise of a small `async` method.
  _(lint: `prefer-await-to-then`, `return-await`, `no-floating-promises`)_
- A string used as an identifier in more than one place (a URL, header, cookie or app name) is a
  named constant in one module. Page text, log event names and error codes stay inline.
- Parse outside data with valibot schemas and built-ins (`URL`, `URLSearchParams`,
  `v.digits()`, `v.slug()`, `v.url()`) instead of regexes or ad hoc string splitting. A regex
  that stays is small, named and inside a schema.
- Comments only for TODOs, links to the docs the code was taken from, and a short "why" for an
  ordering or recovery rule that isn't obvious from the code: what must happen first, or what a
  failure must leave intact. Never narrate what the code does.

The dashboard's look (colours, type, layout, components and the rules behind them) is in
[DESIGN.md](DESIGN.md). Build new screens from it; change it in the same pull request when a
screen needs something it doesn't have.

Tests sit next to the code (`thing.ts` → `thing.test.ts`) and follow Given/When/Then:

- Every test is in a `describe("given …")` with a `test("when …, then …")` title. _(lint:
  `valid-title`, `require-top-level-describe`)_
- The body has three blocks separated by blank lines: set up, act, assert. No `// given`
  comments; the title says it.
- One behaviour per test. A table of cases is a `test.each` with the case in the title.
- Mocks and stubbed globals are restored after each test by the Vitest config; don't add
  `afterEach` hooks for it.

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open
with the next version and the changelog. Merging it tags the release and publishes it on GitHub.
Don't edit `CHANGELOG.md` or version numbers by hand.
