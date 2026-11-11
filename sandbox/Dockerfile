FROM node:26-trixie-slim

ARG OPENCODE_VERSION=2.2.7

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl gh git openssh-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global --ignore-scripts "@opencode/cli-linux-x64-baseline@${OPENCODE_VERSION}" \
  && ln -s /usr/local/lib/node_modules/@opencode/cli-linux-x64-baseline/bin/opencode /usr/local/bin/opencode \
  && opencode --version

COPY --from=docker.io/cloudflare/sandbox:1.0.3 /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim

COPY opencode.json /etc/opencode/opencode.json
COPY --chmod=755 start.sh /usr/local/bin/cinder-start

ENV HOME=/root \
  OPENCODE_DISABLE_AUTOUPDATE=1

CMD ["cinder-start"]
