# OpenCode V2 pull request action

This repository-local composite action runs a pinned OpenCode V2 agent against a pull
request. It validates and checks out the PR, loads a maintained prompt, lets OpenCode make
restricted local edits, commits and pushes any edits, and posts the agent's report to the
PR.

It is intended to be called by [the OpenCode workflow](../../workflows/opencode.yml), not
published to or consumed from the GitHub Marketplace.

## When it runs

| Scenario           | Trigger                                                                      | Eligibility checks                                                                                                                                   | What it does                                                                                                                                                                   | How to use it                                                            |
| ------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Maintainer command | A new PR conversation comment or review comment                              | The comment contains `/opencode` or `/oc`; its author is an owner, member, or collaborator; the PR branch belongs to this repository                 | Runs the `comment.md` prompt plus the comment, commits and pushes edits if needed, and posts a report                                                                          | Comment `/opencode <request>` or `/oc <request>` on a same-repository PR |
| Dependabot review  | The `CI` workflow completes for a Dependabot PR, whether CI passed or failed | The workflow actor and PR author are Dependabot; the branch starts with `dependabot/`; the head repository is this repository; the PR is not a draft | Runs the `dependabot.md` prompt, commits and pushes repairs if needed, posts a report, dispatches CI for the resulting SHA, and squash-merges only after that exact SHA passes | Open or update a normal Dependabot PR; no comment is required            |
| Other PR activity  | Any event that does not meet the checks above                                | Not eligible                                                                                                                                         | The jobs are skipped                                                                                                                                                           | No action is taken                                                       |

The Dependabot path deliberately starts from `workflow_run`. GitHub restricts OIDC and
write permissions on workflows triggered directly by Dependabot, while the
completed-workflow event can request a short-lived Console token after the action verifies
the associated PR again.

## Repository setup

### 1. Configure OpenCode Console OIDC

No long-lived model key is stored in GitHub. The OpenCode Console OAuth client ID is stored in
the `OPENCODE_OIDC_CLIENT_ID` repository variable and passed as `oidc-client-id`. The workflow
requests a GitHub OIDC JWT
for `https://opencode.ai/console` and exchanges it directly with OpenCode Console for a
short-lived access token.

Keep the corresponding GitHub repository trust configured in OpenCode Console. If Console
issues a replacement client ID, update the `OPENCODE_OIDC_CLIENT_ID` variable.
The default model is `opencode/deepseek-v4.1-flash-free`, which OpenCode currently offers
for free for a limited time.

### 2. Keep the CI entry point

The Dependabot automation expects a workflow named `CI` in
[`../../workflows/ci.yml`](../../workflows/ci.yml) with a `workflow_dispatch` trigger. It
dispatches that workflow on the reviewed Dependabot branch and waits for the run to
finish.

### 3. Configure repository protections

- Permit GitHub Actions to request `id-token: write`, `contents: write`,
  `pull-requests: write`, and `actions: write` where the workflow declares them.
- Keep the `CI` check required on the protected default branch.
- Add any required human approval rules you want. The merge command honors branch
  protection and will not bypass those rules.

## Comment commands

Use either supported command in a PR comment:

```text
/opencode update this code for the new API and add regression coverage
```

```text
/oc fix the type error reported by CI
```

The complete trusted comment is appended to
[`prompts/comment.md`](prompts/comment.md). Commands are intentionally limited to trusted
repository members and same-repository PR branches.

## Prompt maintenance

Prompt templates are ordinary Markdown files under [`prompts/`](prompts/):

- [`comment.md`](prompts/comment.md) controls maintainer-command behavior.
- [`dependabot.md`](prompts/dependabot.md) controls automatic dependency reviews.

Edit these files to improve quality, add repository-specific review criteria, or make the
agent's expected report more precise. Dynamic data is appended separately under a
`Run context` heading, so prompts do not need placeholders for the repository or PR
number.

To add another prompt:

1. Add `prompts/<name>.md`, using only lowercase letters, numbers, and hyphens.
2. Call the action with `prompt: <name>`.
3. Add trigger and trust checks in the calling workflow.

## Calling the action

Always check out the trusted workflow commit before calling the local action. Do not
replace that checkout with the PR head checkout; the action checks out PR code separately
under `pr/`.

```yaml
permissions:
  contents: write
  id-token: write
  issues: write
  pull-requests: write

steps:
  - name: Checkout trusted automation
    uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
    with:
      ref: ${{ github.sha }}
      persist-credentials: false

  - name: Run OpenCode
    id: opencode
    uses: ./.github/actions/opencode-v2
    with:
      commit-message: "fix: apply OpenCode changes"
      github-token: ${{ github.token }}
      oidc-client-id: ${{ vars.OPENCODE_OIDC_CLIENT_ID }}
      pr-number: ${{ github.event.pull_request.number }}
      prompt: comment
      request: "Review and repair this pull request."
```

### Inputs

| Input             | Required | Default                             | Purpose                                                                                |
| ----------------- | -------- | ----------------------------------- | -------------------------------------------------------------------------------------- |
| `commit-message`  | Yes      | —                                   | Conventional Commit message used only when files changed                               |
| `github-token`    | Yes      | —                                   | Token used for PR reads, checkout, push, and commenting; it is not exposed to OpenCode |
| `pr-number`       | Yes      | —                                   | Pull request to validate and process                                                   |
| `prompt`          | Yes      | —                                   | Markdown filename under `prompts/`, without `.md`                                      |
| `expected-author` | No       | Empty                               | Requires an exact PR author, such as `dependabot[bot]`                                 |
| `head-ref-prefix` | No       | Empty                               | Requires the PR branch to begin with a prefix, such as `dependabot/`                   |
| `model`           | No       | `opencode/deepseek-v4.1-flash-free` | OpenCode provider/model ID                                                             |
| `oidc-audience`   | No       | `https://opencode.ai/console`       | Audience requested in the GitHub OIDC JWT                                              |
| `oidc-client-id`  | Yes      |                                     | OpenCode Console OAuth client ID, e.g. `vars.OPENCODE_OIDC_CLIENT_ID`                  |
| `request`         | No       | Empty                               | Trusted instructions appended after the maintained prompt                              |
| `require-ready`   | No       | `false`                             | When `true`, rejects draft PRs                                                         |
| `sha256`          | No       | Pinned digest                       | Expected digest of the OpenCode Linux x64 release archive                              |
| `version`         | No       | `2.2.7`                             | Exact OpenCode CLI release                                                             |

### Outputs

| Output     | Meaning                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `head-ref` | Validated same-repository PR branch                                                                             |
| `head-sha` | The commit OpenCode reviewed, or its own commit if it pushed one; the step fails if the PR moved during the run |

When updating OpenCode, update `version` and `sha256` together from the official release
and its `SHA256SUMS` asset.

## Execution flow

1. Fetch PR metadata through GitHub's API.
2. Validate repository ownership, optional author and branch requirements, draft status,
   and the 40-character head SHA.
3. Check out the PR under `pr/` with persisted credentials disabled.
4. Confirm the checkout still matches the validated SHA and reject tracked symlinks.
5. Download the exact official OpenCode archive and verify its pinned SHA-256 digest.
6. Request a GitHub OIDC JWT and exchange it directly for a short-lived Console token.
7. Load the selected Markdown prompt and append the run context and optional request.
8. Run OpenCode with restricted permissions and without a GitHub token.
9. Reject protected-file edits, then commit and push ordinary edits in a separate step
   that has the GitHub token but not the Console token.
10. Read the resulting PR head and post the OpenCode report.
11. For Dependabot, dispatch CI for that exact head, wait for success, recheck the head,
    and request a squash merge.

## Security model

The action separates code, credentials, and privileges by step:

| Boundary                       | Enforcement                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Trusted automation vs. PR code | The workflow checks out its immutable `github.sha`; the action checks out PR code separately under `pr/`                              |
| Console token vs. installer    | Download and extraction explicitly receive empty `OPENCODE_API_KEY` and `GH_TOKEN` values                                             |
| Console token vs. GitHub token | OpenCode receives only the short-lived exchanged token; repository operations receive only `github-token`                             |
| Long-lived credentials         | No model credential is stored in GitHub; `id-token: write` is limited to the two jobs that invoke OpenCode                            |
| OpenCode tools                 | Shell, web access, subagents, external directories, and every unspecified tool are denied                                             |
| Repository configuration       | Project OpenCode config and external skills are disabled; formatter execution and snapshots are disabled                              |
| Sensitive paths                | Edits to `.git`, workflows, local actions, and agent configuration are denied; protected-file changes are checked again before commit |
| Symlink traversal              | PR checkouts containing symlinks are rejected before OpenCode starts                                                                  |
| Release supply chain           | The OpenCode version and Linux x64 archive SHA-256 are pinned                                                                         |
| Merge race                     | CI is selected by exact SHA, and the PR head is compared with that SHA immediately before merge                                       |

The exchanged token is also scanned out of the agent's report: if the exact credential
appears, the report is deleted and the action fails instead of publishing it.

### Residual risks

- Source code and prompt content are sent to the configured model provider.
- An AI edit can be logically wrong even when tests pass.
- CI dependencies and the model provider remain supply-chain dependencies.
- Repository administrators and trusted writers can change the workflow or action.

For those reasons, keep strong deterministic tests, branch protection, dependency
pinning, and human approval requirements appropriate to the repository's risk level.

## Runtime requirements

The action currently targets GitHub-hosted `ubuntu-latest` x64 runners and expects `bash`,
`curl`, `git`, `gh`, `jq`, `sha256sum`, `tar`, and `timeout` to be available.
