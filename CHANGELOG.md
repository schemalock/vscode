# Changelog

All notable changes to the SchemaLock VS Code extension are documented in
this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 0.3.0 — 2026-06-05

### Added

- **Completions for composed CRD schemas.** Autocomplete now works for
  kinds that define their properties via JSON Schema `$ref` or `allOf`
  references rather than inline. Previously these kinds returned no
  suggestions.
- **Deprecated kinds shown as struck-through in autocomplete.** When the
  CDN marks a CRD kind as deprecated, it appears in the completion
  dropdown with a strikethrough and `(deprecated)` label, so you can see
  at a glance which API kinds are no longer recommended.
- Bundled binary updated to v0.3.1.

### Fixed

- **Stale local schema cache caused missing diagnostics.** After the CDN
  re-published a schema, the cached copy was served without re-verifying
  its hash — silently dropping all validation results for the affected
  file. The binary now re-fetches from the CDN when the cached schema
  hash no longer matches the current manifest.

## 0.2.0 — 2026-06-02

### Changed

- **Lockfile replaced by `schemalock.yaml` intent files.** The `schemalock lock`
  command and `schemalock.lock` file are removed. The bundled binary reads
  `schemalock.yaml` directly — no generation step required. Run
  `schemalock add <operator@version>` to pin an operator; the extension
  picks up the change on save automatically.
- **Hierarchical intent.** `schemalock.yaml` files nest: the effective pin set
  for a manifest is the union of every `schemalock.yaml` found walking up from
  the manifest's directory. A nested file with `root: true` halts the walk.
- **`schemalock verify` now applies strict-mode validation by default.**
  Unknown YAML fields cause CI to fail the same way they appear as Error
  diagnostics in the editor. Pass `--no-strict` to restore the previous
  behaviour.
- **New CLI commands:** `schemalock add <name@version>` pins an operator to
  the nearest `schemalock.yaml`; `schemalock fmt` canonicalises the file.
- Extension watches `schemalock.yaml` for changes (was `schemalock.lock`).

### Fixed

- **Per-field diagnostic anchoring.** Each unknown field gets its own squiggle
  at the offending key's source position, not on the parent.
- **Completion filters as you type.** VS Code now filters the completion list
  locally instead of re-querying the server on every keystroke.
- Multiple LSP stability fixes: concurrent resolver coalescing, worker pool
  shutdown race, yaml-ls stdout drain, atomic strict-mode flag, cache path
  traversal guard, HTTP response size cap.

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
