FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8

# Toolchain + headless display + libraries VS Code needs to launch under @vscode/test-electron.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gnupg \
      sudo \
      tar \
      xz-utils \
      jq \
      xvfb \
      xauth \
      libnss3 \
      libgbm1 \
      libasound2 \
      libxkbfile1 \
      libsecret-1-0 \
      libgtk-3-0 \
      libx11-xcb1 \
      libdrm2 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libxshmfence1 \
      libxss1 \
      libnotify4 \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# GitHub CLI (used by release workflows to download cross-repo artifacts and create releases).
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | tee /usr/share/keyrings/githubcli-archive-keyring.gpg > /dev/null \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.source="https://github.com/schemalock/vscode" \
      org.opencontainers.image.description="SchemaLock CI base image — Debian + xvfb + VS Code runtime libs + gh CLI. Node and Go install via actions/setup-*." \
      org.opencontainers.image.licenses="Apache-2.0"
