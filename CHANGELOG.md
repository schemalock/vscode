# Changelog

All notable changes to the SchemaLock VS Code extension are documented in
this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## 0.3.3 — 2026-05-22

### Changed

- README and CHANGELOG polished for the marketplace listing. No code changes.

## 0.3.2 — 2026-05-22

### Added

- **CDN schema fallback for unpinned files.** When a YAML document's
  `apiVersion`+`kind` is not in the workspace's `schemalock.lock` but a
  schema is available on `cdn.schemalock.dev`, the extension auto-fetches
  the latest published version and uses it for completion, hover, and
  validation. Lets you open and work with CRD YAML in any workspace,
  without authoring a lockfile first.
- **Per-file status bar.** Shows whether the schema for the active file is
  Pinned (from your lockfile), Unpinned (from the CDN), Preview (you picked
  an alternate version this session), or Error / Unindexable. Click it to
  pick a different version for the active file without modifying the
  lockfile.
- **Setting `schemalock.fallback.enabled`** (default `true`) — disable to
  restrict the extension to lockfile-pinned schemas only and skip the CDN.
- **Commands:** *SchemaLock: Pick Schema Version for This File…* and
  *SchemaLock: Retry CDN Resolution*.

### Fixed

- Extension now activates in workspaces without a `schemalock.lock`.
  Previously the extension early-returned during activation, leaving
  commands unregistered and the LSP unstarted — which defeated the CDN
  fallback for new users.
- Completion no longer returns "No suggestions" when the cursor sits on a
  blank line that is *less* indented than the deepest preceding key. Common
  case: finishing a nested block and adding a sibling at the outer level
  (e.g. another `spec` child after `gracefulRestart:`).

## 0.2.0 — 2026-05-21

### Breaking

- **`schemalock.mode` setting removed.** The extension no longer chooses
  between "contributor" and "standalone" modes; the bundled `schemalock`
  binary now owns YAML LSP traffic end-to-end and spawns
  `yaml-language-server` as a subprocess for non-CRD YAML when available.
- Users with `schemalock.mode` set in their settings can remove the entry;
  it is silently ignored.

### Added

- **`schemalock.yamlLanguageServer.path`** — optional override for the
  `yaml-language-server` binary the extension spawns. Empty (default)
  means search `PATH`. When `yaml-language-server` cannot be located, the
  extension continues to operate against lockfile-owned files only.
- Hover, completion, definition, references, and document symbols are now
  served on every YAML file. Owned files (apiVersion/kind matches the
  lockfile) use SchemaLock's integrity-pinned schema; other files proxy
  through `yaml-language-server` when present.

## 0.1.1 — 2026-05-20

### Fixed

- **Contributor mode no longer publishes duplicate diagnostics** when
  `yaml-language-server` is the primary validator.
- **Hover no longer surfaces "neither a result nor an error" errors** on
  files with no available documentation.
- **Ctrl+Space on a blank line at sibling indent now offers new-property
  completion.** Previously the cursor was misclassified as inside the
  previous key's value, returning "No suggestions". Already-present keys
  are filtered out.
- **Picking a completion item now produces parseable YAML.** Items include
  proper `insertText` that appends `: ` for scalars and a snippet opening
  a child block for object/array fields.
- **Ctrl+Space inside an empty nested object** (e.g. on a blank indented
  line under `vmselect:`) now offers the child properties of that object
  instead of returning empty.
- **Contributor mode no longer surfaces duplicate completion suggestions
  or hover popups** when `yaml-language-server` owns the file's languageId.

## 0.1.0 — 2026-05-19

### Added

- Initial release.
- **Standalone mode**: spawns `schemalock serve --stdio` as a full LSP
  server providing diagnostics, autocomplete, and hover for Kubernetes
  YAML files pinned by a `schemalock.lock` file.
- **Contributor mode**: integrates with `redhat.vscode-yaml` by registering
  SchemaLock as a schema contributor. `yaml-language-server` handles the
  actual validation and completion.
- **Auto mode selection** (default): contributor mode when
  `redhat.vscode-yaml` is installed, standalone otherwise.
- Per-platform bundled binaries for `linux-x64`, `linux-arm64`,
  `darwin-x64`, `darwin-arm64`, and `win32-x64`. No download on first run.
- Activation on `workspaceContains:**/schemalock.lock`,
  `workspaceContains:**/schemalock.yaml`, and `onLanguage:yaml`.
- Configuration settings: `schemalock.mode`, `schemalock.binaryPath`,
  `schemalock.trace.server`.
- Lockfile watcher: reloads the resolver when `schemalock.lock` changes.

### Known limitations

- Multi-doc YAML in contributor mode uses the first document only.
  Standalone mode handles every document correctly.
- Contributor mode requires `redhat.vscode-yaml` ≥ 1.13.0.
