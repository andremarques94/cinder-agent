#!/bin/sh
set -eu

# https://developers.cloudflare.com/containers/configuration/outbound-traffic/#trust-the-ca-certificate
ca=/etc/cloudflare/certs/cloudflare-containers-ca.crt
if [ -e "$ca" ]; then
  cp "$ca" /usr/local/share/ca-certificates/cloudflare-containers-ca.crt
  update-ca-certificates > /dev/null
  export NODE_EXTRA_CA_CERTS="$ca"
fi

mkdir -p "$CINDER_RUN_DIR"
until [ -e "$CINDER_RUN_DIR/ready" ]; do
  sleep 0.2
done

mkdir -p "$CINDER_WORKSPACE"
cd "$CINDER_WORKSPACE"

opencode serve --hostname 0.0.0.0 --port "$OPENCODE_PORT" &
echo "$!" > "$CINDER_RUN_DIR/opencode.pid"
wait "$!"
