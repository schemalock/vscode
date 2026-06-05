# Contributing to SchemaLock VS Code Extension

## What belongs here

This repo is a thin VS Code shell. It handles:
- Starting and restarting the `schemalock` language server process
- Status bar, middleware, command palette entries
- VS Code-level settings and activation events

Completion, validation, hover, and diagnostics logic live in the `schemalock`
binary (separate project, not open source). Issues with those behaviours should
describe what you observe in the extension — a maintainer will route it.

## Development setup

```bash
git clone https://github.com/schemalock/vscode
cd vscode
npm install
npm run bundle        # build dist/extension.js
npm run test:unit     # fast unit tests (no binary needed)
npm test              # full integration tests (requires bundled binary)
```

The bundled binary in `bin/` is pre-built for each platform. To test against a
local binary, set `schemalock.binaryPath` in VS Code settings to point at your
build.

## Running tests

**Unit tests** — no binary required, runs anywhere:
```bash
npm run test:unit
```

**Integration tests** — require the bundled binary and a display server:
```bash
# macOS / Linux with display
npm test

# Linux headless
xvfb-run -a npm test
```

## Pull requests

- One logical change per PR
- `npm run compile && npm run lint && npm run test:unit` must pass locally
- Add or update tests for any behaviour change
- Commit format: `type(scope): description`
  (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`)

## CI

The CI pipeline runs on every PR:
- **build job**: lint, type-check, bundle, unit tests — runs on all PRs including forks
- **integration job**: full VS Code extension host tests — runs on push to `master`
  and PRs from within the org (requires access to the private binary release)

## Issues

Use the issue templates. For bugs, always include the SchemaLock output channel
log (View → Output → SchemaLock).
