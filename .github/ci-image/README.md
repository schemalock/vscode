# `ci-base` — SchemaLock CI base image

Debian bookworm-slim with the headless toolchain CI workflows in this org
need to run VS Code extension tests:

- `Xvfb` + `xvfb-run` — virtual framebuffer for the extension host
- VS Code's Linux runtime dependencies (`libnss3`, `libgbm1`, `libgtk-3-0`,
  etc.) downloaded by `@vscode/test-electron`
- `gh` CLI for cross-repo artifact download in release workflows
- Common build tooling: `git`, `curl`, `tar`, `xz-utils`, `jq`

**Not included:** Node and Go. `actions/setup-node@v4` and
`actions/setup-go@v5` install those into the workspace per workflow.

## Build and publish

Push to `main` touching `.github/ci-image/**` or
`.github/workflows/build-ci-image.yml` rebuilds and pushes via
[`build-ci-image.yml`](../workflows/build-ci-image.yml).

Tags published per build:
- `ghcr.io/schemalock/ci-base:latest`
- `ghcr.io/schemalock/ci-base:<sha>` — immutable, use for pinning

## First-time publish: make the package public

GHCR creates the package as **private** on first push. To allow the
self-hosted runner to pull without auth:

1. Go to <https://github.com/orgs/schemalock/packages/container/ci-base/settings>
2. Under *Danger zone*, change visibility to **Public**

Or via API:
```bash
gh api -X PATCH /orgs/schemalock/packages/container/ci-base/visibility \
  -f visibility=public
```

## Consuming the image

In a workflow:

```yaml
jobs:
  build:
    runs-on:
      group: self-host
    container:
      image: ghcr.io/schemalock/ci-base:latest
```

Pin to `:<sha>` once the workflow stabilizes to avoid surprise upgrades.
