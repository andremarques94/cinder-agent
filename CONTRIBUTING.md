# Contributing

## Setup

Follow the requirements and local development steps in the [README](README.md). `vp install`
also installs the git hooks: one formats and checks staged files, one checks commit messages.

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
- `vp check` and `vp run -r test` must pass; CI runs both.
- Follow the code rules in [apps/gateway/README.md](apps/gateway/README.md).

## Releases

[release-please](https://github.com/googleapis/release-please) keeps a release pull request open
with the next version and the changelog. Merging it tags the release and publishes it on GitHub.
Don't edit `CHANGELOG.md` or version numbers by hand.
