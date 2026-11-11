set -euo pipefail

: "${EXPECTED_HEAD_SHA:?EXPECTED_HEAD_SHA is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"
: "${PR_URL:?PR_URL is required}"

current="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}" --jq '.head.sha')"
if [[ "${current}" != "${EXPECTED_HEAD_SHA}" ]]; then
  echo "The pull request changed after CI; refusing to merge." >&2
  exit 1
fi
gh pr merge "${PR_URL}" --squash --delete-branch --match-head-commit "${EXPECTED_HEAD_SHA}"
