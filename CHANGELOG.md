# Changelog

All notable changes to the SchemaLock VS Code extension are documented in
this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## Unreleased

### Changed

- Bundled `schemalock` binary now applies strict-mode validation in
  `schemalock verify` by default, matching the LSP. Unknown YAML fields
  cause CI to fail the same way they appear as Error diagnostics in the
  editor. Pass `--no-strict` to opt out.

## 0.1.2 — 2026-05-23

### Fixed

- Autocomplete inside one block returned completions from a different
  sibling block when the preceding block contained deeper-nested keys.
  For example, pressing Ctrl+Space inside `unauthorizedUserAccessSpec`
  on a VMAuth document offered `httpRoute`'s properties instead of the
  expected `discover_backend_ips`, `default_url`, `targetRefs`, etc.
  Bundled `schemalock` binary updated to v0.1.1.

## 0.1.1 — 2026-05-23

### Added

- One-time warning on activation when `redhat.vscode-yaml` is also
  installed. Both extensions register for the YAML language and publish
  duplicate diagnostics; Red Hat YAML's built-in Kubernetes contributor
  also surfaces "No content" errors for CRDs it does not bundle.
  The warning offers a shortcut to manage the conflicting extension and a
  "Don't show again" dismissal.

## 0.1.0 — 2026-05-22

### Added

- Initial release.
- **Single-binary LSP.** The extension spawns the bundled `schemalock`
  binary, which provides diagnostics, completion, and hover for
  Kubernetes YAML end-to-end. `yaml-language-server` is spawned as a
  subprocess for non-CRD YAML when available.
- **CDN schema fallback for unpinned files.** When a YAML document's
  `apiVersion`+`kind` is not in the workspace's `schemalock.lock` but a
  schema is available on `cdn.schemalock.dev`, the extension auto-fetches
  the latest published version and uses it for completion, hover, and
  validation. Lets you open and work with CRD YAML in any workspace,
  without authoring a lockfile first.
- **Per-file status bar.** Shows whether the schema for the active file
  is Pinned (from your lockfile), Unpinned (from the CDN), Preview (you
  picked an alternate version this session), or Error / Unindexable.
  Click it to pick a different version for the active file without
  modifying the lockfile.
- **Settings:**
  - `schemalock.fallback.enabled` (default `true`) — disable to restrict
    the extension to lockfile-pinned schemas only and skip the CDN.
  - `schemalock.yamlLanguageServer.path` — optional override for the
    `yaml-language-server` binary the extension spawns.
  - `schemalock.binaryPath` — optional override for the bundled
    `schemalock` binary.
  - `schemalock.trace.server` — LSP traffic trace level.
- **Commands:** *SchemaLock: Restart Language Server*, *Show Output*,
  *Pick Schema Version for This File…*, *Retry CDN Resolution*.
- Per-platform bundled binaries for `linux-x64`, `linux-arm64`,
  `darwin-x64`, `darwin-arm64`, and `win32-x64`. No download on first run.
- Activation on `workspaceContains:**/schemalock.lock`,
  `workspaceContains:**/schemalock.yaml`, and `onLanguage:yaml`.
- Lockfile watcher: reloads the resolver when `schemalock.lock` changes.
