#!/bin/sh
set -eu

mkdir -p "$CINDER_RUN_DIR"
until [ -e "$CINDER_RUN_DIR/ready" ]; do
  sleep 0.2
done

mkdir -p "$CINDER_WORKSPACE"
cd "$CINDER_WORKSPACE"

opencode serve --hostname 0.0.0.0 --port "$OPENCODE_PORT" &
echo "$!" > "$CINDER_RUN_DIR/opencode.pid"
wait "$!"
