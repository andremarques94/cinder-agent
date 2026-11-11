set -euo pipefail

: "${COMMIT_MESSAGE:?COMMIT_MESSAGE is required}"
: "${GH_TOKEN:?GH_TOKEN is required}"
: "${HEAD_REF:?HEAD_REF is required}"

protected=(.github/actions .github/workflows .opencode .agents .claude opencode.json opencode.jsonc)
if [[ -n "$(git status --porcelain -- "${protected[@]}")" ]]; then
  echo "OpenCode attempted to modify protected automation or configuration files." >&2
  exit 1
fi
[[ -n "$(git status --porcelain)" ]] || exit 0

git diff --check
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -m "${COMMIT_MESSAGE}"

basic="$(printf 'x-access-token:%s' "${GH_TOKEN}" | base64 -w0)"
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${basic}" \
  push origin "HEAD:${HEAD_REF}"
