set -euo pipefail

: "${EXPECTED_HEAD_SHA:?EXPECTED_HEAD_SHA is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${HEAD_REF:?HEAD_REF is required}"

previous="$(gh run list --repo "${GITHUB_REPOSITORY}" --workflow ci.yml --event workflow_dispatch \
  --limit 50 --json databaseId --jq 'map(.databaseId) | max // 0')"
gh workflow run ci.yml --repo "${GITHUB_REPOSITORY}" --ref "${HEAD_REF}"

run_id=""
for _ in {1..30}; do
  runs="$(gh run list --repo "${GITHUB_REPOSITORY}" --workflow ci.yml --branch "${HEAD_REF}" \
    --event workflow_dispatch --limit 20 --json databaseId,headSha)"
  run_id="$(jq -r --arg sha "${EXPECTED_HEAD_SHA}" --argjson previous "${previous}" \
    '[.[] | select(.headSha == $sha and .databaseId > $previous)] | max_by(.databaseId).databaseId // empty' \
    <<< "${runs}")"
  [[ -n "${run_id}" ]] && break
  sleep 2
done

[[ -n "${run_id}" ]] || { echo "Could not find the dispatched CI run." >&2; exit 1; }
gh run watch "${run_id}" --repo "${GITHUB_REPOSITORY}" --exit-status
