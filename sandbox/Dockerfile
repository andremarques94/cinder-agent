FROM node:25-trixie-slim

ARG OPENCODE_VERSION=2.2.7

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git openssh-client ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN npm install --global --ignore-scripts "@opencode/cli-linux-x64-baseline@${OPENCODE_VERSION}" \
  && ln -s /usr/local/lib/node_modules/@opencode/cli-linux-x64-baseline/bin/opencode /usr/local/bin/opencode \
  && opencode --version

COPY opencode.json /etc/opencode/opencode.json

ENV HOME=/root \
  XDG_CONFIG_HOME=/root/.config \
  XDG_DATA_HOME=/root/.local/share \
  XDG_STATE_HOME=/root/.local/state \
  XDG_CACHE_HOME=/root/.cache \
  OPENCODE_DISABLE_AUTOUPDATE=1

WORKDIR /workspace
