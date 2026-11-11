set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${PR_NUMBER:?PR_NUMBER is required}"

pr="$(gh api "repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}")"
author="$(jq -r '.user.login' <<< "${pr}")"
draft="$(jq -r '.draft' <<< "${pr}")"
head_repo="$(jq -r '.head.repo.full_name' <<< "${pr}")"
head_ref="$(jq -r '.head.ref' <<< "${pr}")"
head_sha="$(jq -r '.head.sha' <<< "${pr}")"

if [[ "${head_repo}" != "${GITHUB_REPOSITORY}" || -z "${head_ref}" || ! "${head_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Refusing to run for a pull request from an untrusted repository." >&2
  exit 1
fi
if [[ -n "${EXPECTED_AUTHOR:-}" && "${author}" != "${EXPECTED_AUTHOR}" ]]; then
  echo "Unexpected pull request author." >&2
  exit 1
fi
if [[ "${REQUIRE_READY:-false}" == "true" && "${draft}" != "false" ]]; then
  echo "Refusing to run for a draft pull request." >&2
  exit 1
fi
if [[ -n "${HEAD_REF_PREFIX:-}" && "${head_ref}" != "${HEAD_REF_PREFIX}"* ]]; then
  echo "Unexpected pull request branch." >&2
  exit 1
fi

echo "number=${PR_NUMBER}" >> "${GITHUB_OUTPUT}"
echo "ref=${head_ref}" >> "${GITHUB_OUTPUT}"
echo "sha=${head_sha}" >> "${GITHUB_OUTPUT}"
