set -euo pipefail

: "${INPUT_MODEL:?model is required}"
: "${INPUT_PR_NUMBER:?pr-number is required}"
: "${INPUT_PROMPT_NAME:?prompt is required}"
: "${INPUT_WORKING_DIRECTORY:?working-directory is required}"
: "${OPENCODE_BIN:?OpenCode binary path is required}"
: "${OPENCODE_API_KEY:?api-key is required}"
: "${REPORT_FILE:?report path is required}"

if [[ ! "${INPUT_PROMPT_NAME}" =~ ^[a-z0-9-]+$ ]]; then
  echo "Invalid prompt template name: ${INPUT_PROMPT_NAME}" >&2
  exit 1
fi

prompt_file="${GITHUB_ACTION_PATH}/prompts/${INPUT_PROMPT_NAME}.md"
if [[ ! -d "${INPUT_WORKING_DIRECTORY}" || ! -x "${OPENCODE_BIN}" || ! -f "${prompt_file}" || "${REPORT_FILE}" != /* ]]; then
  echo "Invalid OpenCode working directory or report path." >&2
  exit 1
fi

export NO_COLOR=1
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1
export OPENCODE_DISABLE_PROJECT_CONFIG=1
export OPENCODE_PURE=1
export XDG_CACHE_HOME="${RUNNER_TEMP}/opencode/cache"
export XDG_CONFIG_HOME="${RUNNER_TEMP}/opencode/config"
export XDG_DATA_HOME="${RUNNER_TEMP}/opencode/data"
export XDG_STATE_HOME="${RUNNER_TEMP}/opencode/state"
export OPENCODE_CONFIG_CONTENT='{
  "$schema": "https://opencode.ai/config.json",
  "snapshots": false,
  "formatter": false,
  "permissions": [
    { "action": "*", "resource": "*", "effect": "deny" },
    { "action": "read", "resource": "*", "effect": "allow" },
    { "action": "glob", "resource": "*", "effect": "allow" },
    { "action": "grep", "resource": "*", "effect": "allow" },
    { "action": "edit", "resource": "*", "effect": "allow" },
    { "action": "edit", "resource": ".git/*", "effect": "deny" },
    { "action": "edit", "resource": ".github/actions/*", "effect": "deny" },
    { "action": "edit", "resource": ".github/workflows/*", "effect": "deny" },
    { "action": "edit", "resource": ".opencode/*", "effect": "deny" },
    { "action": "edit", "resource": ".agents/*", "effect": "deny" },
    { "action": "edit", "resource": ".claude/*", "effect": "deny" },
    { "action": "edit", "resource": "opencode.json", "effect": "deny" },
    { "action": "edit", "resource": "opencode.jsonc", "effect": "deny" },
    { "action": "external_directory", "resource": "*", "effect": "deny" }
  ]
}'

prompt="$(cat "${prompt_file}")"
prompt+=$'\n\n## Run context\n\n'
prompt+="Repository: ${GITHUB_REPOSITORY}"$'\n'
prompt+="Pull request: #${INPUT_PR_NUMBER}"
if [[ -n "${INPUT_REQUEST:-}" ]]; then
  prompt+=$'\n\n## Trusted maintainer request\n\n'
  prompt+="${INPUT_REQUEST}"
fi

mkdir -p "$(dirname "${REPORT_FILE}")"
cd "${INPUT_WORKING_DIRECTORY}"

set +e
timeout 45m "${OPENCODE_BIN}" run --standalone --archived \
  --model "${INPUT_MODEL}" "${prompt}" | tee "${REPORT_FILE}"
status="${PIPESTATUS[0]}"
set -e

if grep -Fq -- "${OPENCODE_API_KEY}" "${REPORT_FILE}"; then
  rm -f "${REPORT_FILE}"
  echo "OpenCode output contained the provider credential; refusing to publish it." >&2
  exit 1
fi

exit "${status}"
