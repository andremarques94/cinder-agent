#!/bin/sh
set -u

name="${1:-me}"
email="${EMAIL:-me@example.com}"
port="${PORT:-8787}"
dev_vars="$(dirname "$0")/../apps/gateway/.dev.vars"
token="${ADMIN_TOKEN:-$(sed -n 's/^ADMIN_TOKEN=//p' "$dev_vars" 2>/dev/null)}"
failures=0

check() {
  label="$1"
  shift
  if "$@" > /dev/null 2>&1; then
    echo "ok    $label"
  else
    echo "FAIL  $label"
    failures=$((failures + 1))
  fi
}

in_container() {
  docker exec "$container" sh -c "$1"
}

invite="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $token" -H 'content-type: application/json' \
  -d "{\"email\":\"$email\",\"sandbox\":\"$name\"}" "http://localhost:$port/admin/users")"
check "$email is invited as $name" sh -c "[ '$invite' = 201 ] || [ '$invite' = 409 ]"
if [ "$email" = me@example.com ]; then
  check "app.localhost:$port signs in as $email and shows $name" \
    sh -c "curl -fsS -m 30 http://app.localhost:$port/api/me | grep -q '\"sandbox\":\"$name\"'"
  check "the dashboard shows Devices, GitHub and Settings" \
    sh -c "curl -fsS -m 30 http://app.localhost:$port/ | grep -q 'action=\"/devices/pair\"'"
  check "Pair a device shows a QR code of a one-time link" \
    sh -c "curl -fsS -m 180 -X POST -H 'Origin: http://app.localhost:$port' http://app.localhost:$port/devices/pair | grep -q '<svg.*/auth/connect/'"
else
  echo "skip  app.localhost (access.dev in wrangler.jsonc signs in as me@example.com)"
fi
check "sandbox answers at $name.localhost:$port" \
  curl -fsS -m 180 -o /dev/null "http://$name.localhost:$port/"
check "admin status reports ready" \
  sh -c "curl -fsS -m 30 -H 'Authorization: Bearer $token' http://localhost:$port/admin/sandboxes/$name | grep -q '\"ready\":true'"

container="$(docker ps --format '{{.ID}} {{.Image}}' | awk '/opencodesandbox/ { print $1; exit }')"
if [ -z "$container" ]; then
  echo "FAIL  no running sandbox container"
  exit 1
fi

check "opencode runs in the container" in_container "opencode --version"
check "workspace is under /persist" in_container "test -d /persist/workspace"

if [ -z "$(in_container 'printenv GH_TOKEN' 2> /dev/null)" ]; then
  echo "skip  GitHub (no GitHub App configured)"
else
  repo="$(in_container "gh api /installation/repositories --jq '.repositories[0].full_name'" 2> /dev/null)"
  check "gh reaches GitHub with the app token" test -n "$repo"
  check "commits are authored by the app bot" in_container 'printenv GIT_AUTHOR_NAME | grep -q "\[bot\]$"'
  check "git can read $repo" in_container "git ls-remote https://github.com/$repo HEAD"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
