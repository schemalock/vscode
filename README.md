# SchemaLock — VS Code Extension

Versioned, integrity-pinned schemas for YAML — autocomplete, hover docs,
and validation for Kubernetes CRDs from
[cdn.schemalock.dev](https://cdn.schemalock.dev).

Open any Kubernetes CRD YAML and SchemaLock fetches the right JSON Schema
from the SchemaLock CDN, validates the document, and powers completion and
hover. Commit a `schemalock.lock` to pin exact CRD versions across your
team with integrity hashes — every schema verified before use, no
trust-on-first-use, no API key, no cloud sync.

The bundled `schemalock` binary lives in
[schemalock/app](https://github.com/schemalock/app); this repo is the
thin VS Code shell around it.

## Install

**VS Code Marketplace**

```
ext install SchemaLock.schemalock
```

**Open VSX**

```bash
ovsx get SchemaLock.schemalock
```

**Manual `.vsix`**

```bash
code --install-extension schemalock-vscode-darwin-arm64-0.1.2.vsix
```

(Substitute the file matching your OS and architecture.)

## Quick start — no lockfile required

1. Open any Kubernetes CRD YAML in VS Code. The extension activates
   automatically on YAML files.
2. The schema for the document's `apiVersion`+`kind` is fetched from
   `cdn.schemalock.dev` (cached locally after the first request) and used
   for:
   - **Autocomplete** for properties and enum values.
   - **Hover docs** from the operator's CRD `description` fields.
   - **Red squiggles** on type errors.
3. The status bar shows the resolution state for the active file:
   *Pinned*, *Unpinned*, *Preview*, *Error*, or *Unindexable*. Click it to
   pick a different version for the active file (preview only — does not
   modify any lockfile).

## Lock CRD versions for your team

For reproducible validation across CI and contributors, commit a
`schemalock.lock` to your repo.

1. Create `schemalock.yaml` next to your manifests:

   ```yaml
   version: 1
   ecosystems:
     kubernetes:
       - operator.victoriametrics.com@0.70.0
   ```

2. Generate the lockfile (`schemalock` CLI is bundled with the extension,
   or install separately with
   `go install github.com/schemalock/app/cmd/schemalock@latest`):

   ```bash
   schemalock lock
   ```

3. Reload the editor. Files whose `apiVersion`+`kind` match an entry are
   now served from the integrity-pinned schema; everything else continues
   to use the CDN fallback.

## How it works

A single `schemalock serve --stdio` subprocess runs as the LSP server for
`yaml` documents. For documents whose `apiVersion`+`kind` are in the
lockfile, SchemaLock provides diagnostics, completion, hover, definition,
references, and document symbols using the integrity-pinned schema. For
documents not in the lockfile, the extension auto-fetches the latest
available schema from `cdn.schemalock.dev`.

When `yaml-language-server` is available on the host, SchemaLock spawns it
as a subprocess and proxies non-CRD YAML traffic through it — so plain
Kubernetes manifests, GitHub workflows, etc. still get rich tooling.
Diagnostics for CRD files are dropped from the `yaml-language-server`
stream to avoid duplicates.

## Optional: install yaml-language-server

For non-CRD YAML (workflows, plain Kubernetes manifests, etc.) install
`yaml-language-server` v1.14 or newer:

```bash
npm install -g yaml-language-server
```

The extension auto-discovers it on `PATH`. To point at a specific install,
set `schemalock.yamlLanguageServer.path`. When `yaml-language-server` is
absent, SchemaLock continues to operate but only serves files it can
resolve a schema for (lockfile or CDN).

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `schemalock.fallback.enabled` | `boolean` | `true` | Auto-fetch schemas from `cdn.schemalock.dev` for files not in the lockfile. Disable to restrict the extension to lockfile-pinned schemas only. |
| `schemalock.yamlLanguageServer.path` | `string` | `""` | Override the path to `yaml-language-server`. Empty = search `PATH`. |
| `schemalock.binaryPath` | `string \| null` | `null` | Override the bundled `schemalock` binary. |
| `schemalock.trace.server` | `"off"` \| `"messages"` \| `"verbose"` | `"off"` | Trace LSP traffic to the SchemaLock output channel. |

## Commands

- **SchemaLock: Show Output** — open the SchemaLock log channel.
- **SchemaLock: Restart Language Server** — restart the bundled LSP.
- **SchemaLock: Pick Schema Version for This File…** — preview a different
  CRD version for the active file (does not modify the lockfile).
- **SchemaLock: Retry CDN Resolution** — re-attempt fetching a schema for
  the active file after a network error.

## Troubleshooting

**No diagnostics / no autocomplete**

1. Open the Output panel and select `SchemaLock` from the dropdown.
2. Verify the binary started (`[extension] language client started`).
3. Confirm the document has a recognised `apiVersion` and `kind`.

**Wrong binary architecture**

```
Error: SchemaLock binary not found at: .../bin/linux-arm64/schemalock
```

Set `schemalock.binaryPath` to a locally built binary:

```bash
go install github.com/schemalock/app/cmd/schemalock@latest
# then set schemalock.binaryPath = "$(which schemalock)"
```

## Known limitations

- **Running `redhat.vscode-yaml` alongside SchemaLock causes
  `yaml-language-server` to run twice** (once inside `redhat.vscode-yaml`,
  once as a subprocess of SchemaLock), leading to duplicate diagnostics
  and "No content" errors from Red Hat YAML's bundled Kubernetes
  contributor for CRDs it does not ship. SchemaLock detects this on
  activation and offers a one-time notification with a shortcut to
  manage the conflicting extension. For SchemaLock workspaces, disable
  `redhat.vscode-yaml` and let SchemaLock manage the
  `yaml-language-server` lifecycle.
- **Schema updates require running `schemalock lock` again** for pinned
  files. The lockfile watcher reloads the resolver automatically; open
  files re-validate on the next change.

## Contributing

Source lives in `vscode/src/` (~200 LOC TypeScript). Build:

```bash
cd vscode
npm install
npm run bundle     # esbuild → dist/extension.js
npm test           # @vscode/test-electron integration tests
```
