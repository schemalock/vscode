# SchemaLock Extension — Manual Smoke Test Checklist (v0.2.0)

Run before publishing to the Marketplace. All items must pass on each target
platform.

## Architecture recap (v0.2.0)

There is **one** startup path. The extension spawns the bundled `schemalock`
binary, which owns yaml LSP traffic end-to-end: it spawns yaml-language-server
as a subprocess and proxies unowned YAML to it. Owned documents (apiVersion +
kind present in `schemalock.lock`) are served by schemalock; everything else is
served by yaml-ls. There is no `schemalock.mode` setting and no contributor /
standalone split.

## Environment setup

- [ ] Install VS Code (latest stable).
- [ ] Uninstall any previous SchemaLock extension and `redhat.vscode-yaml`
      (we want a clean baseline; reinstall yaml later only if testing the
      conflict matrix).
- [ ] Install the per-platform `.vsix`:
      ```bash
      code --install-extension schemalock-vscode-0.2.0-darwin-arm64.vsix
      ```
      Replace `darwin-arm64` with `linux-x64`, `linux-arm64`, `darwin-x64`, or
      `win32-x64` as appropriate.
- [ ] Ensure `yaml-language-server` is on `PATH` (e.g.
      `npm i -g yaml-language-server`) **or** set
      `schemalock.yamlLanguageServer.path` to an absolute path.

## Owned document (schemalock-served)

- [ ] Open `vscode/test/fixtures/workspace_good`.
- [ ] Open `vmcluster.yaml`.
- [ ] Status bar shows **SchemaLock: running**.
- [ ] No red squiggles on the valid file.
- [ ] `Ctrl+Space` in the `spec:` block offers schemalock completions.
- [ ] Hover on `retentionPeriod` shows documentation from the pinned schema.
- [ ] Output panel → `SchemaLock`: log shows the binary started and yaml-ls
      was located (or "yaml-language-server not found" if intentionally absent).
- [ ] Open `vscode/test/fixtures/workspace_bad/vmcluster_typo.yaml`.
- [ ] A red squiggle appears on `replicationFactor: "three"` within ~1s.
- [ ] **Exactly one** diagnostic appears for that error (no duplicates from a
      second LSP).

## Unowned document (yaml-ls proxy)

- [ ] In the same workspace, create or open a YAML file whose `apiVersion` /
      `kind` is **not** in `schemalock.lock` (e.g. a stock `Deployment`).
- [ ] Confirm yaml-ls features still work: indentation completion, generic
      YAML syntax diagnostics, document symbols (Outline panel populated).
- [ ] Hover / completion are served by yaml-ls (schemalock makes no claim).
- [ ] Output panel shows the request being proxied to yaml-ls (with
      `schemalock.trace.server` = `verbose`).

## yaml-language-server absent

- [ ] Set `schemalock.yamlLanguageServer.path` to `/tmp/nonexistent-yamlls`
      and reload the window.
- [ ] Status bar still shows **running** (schemalock degrades gracefully).
- [ ] Owned document: completion / hover / diagnostics still work.
- [ ] Unowned document: no crash; schemalock produces no diagnostics for it.
- [ ] Output panel logs that yaml-ls could not be started.
- [ ] Restore `schemalock.yamlLanguageServer.path` to empty.

## Missing schemalock binary

- [ ] Set `schemalock.binaryPath` to `/tmp/nonexistent_schemalock`.
- [ ] Reload the window.
- [ ] VS Code shows an error notification:
      `SchemaLock: binary not found at: /tmp/nonexistent_schemalock`.
- [ ] Status bar shows **off** (or **crashed** if it tried to start).
- [ ] VS Code itself does not crash.
- [ ] Reset `schemalock.binaryPath` to empty (use bundled).

## Restart budget (crash loop)

- [ ] Replace the bundled binary with `/usr/bin/false` (or a script that
      exits 1) and reload.
- [ ] Within ~60s, schemalock should attempt to restart, then give up at the
      5th crash. Status bar transitions: starting → crashed → restarting → …
      → **crashed (giving up)**.
- [ ] VS Code shows a notification offering "Restart Language Server".
- [ ] Restore the real binary; run **SchemaLock: Restart Language Server**
      from the command palette. Status returns to **running**.

## Lockfile watcher

- [ ] With `workspace_good` open, confirm `vmcluster.yaml` is clean.
- [ ] In a terminal, corrupt a hash in `schemalock.lock` (flip one character
      in an `integrity:` value).
- [ ] The open document gets a new diagnostic (integrity mismatch) within
      ~1s without reloading the window.
- [ ] Restore the correct hash; diagnostic clears.

## Conflict with redhat.vscode-yaml

- [ ] Install `redhat.vscode-yaml` and reload.
- [ ] Open `vmcluster.yaml`. Owned diagnostics should appear **once**, not
      duplicated by yaml-ls (schemalock's yaml-ls subprocess drops diagnostics
      for owned URIs, but the user-installed yaml-ls extension does not — this
      is the known limitation; document any duplicates observed).
- [ ] Uninstall `redhat.vscode-yaml` before continuing.

## Windows (win32-x64)

- [ ] Repeat the "Owned document" and "Unowned document" sections on a
      Windows host using the `win32-x64` VSIX.
- [ ] Confirm `bin\win32-x64\schemalock.exe` spawns without UAC prompts.
- [ ] yaml-language-server resolution: confirm `where yaml-language-server`
      is honoured.

## Registry fallback (CDN auto-fetch)

Requires network access to `cdn.schemalock.dev` (or set
`SCHEMALOCK_REGISTRY_BASE` to a fake CDN).

- [ ] Open a workspace **without** `schemalock.lock` (e.g. an empty
      directory containing only `vmcluster.yaml`).
- [ ] Confirm status bar shows `$(unlock) VMCluster · <latest>` within ~1s of opening.
- [ ] Hover the apiVersion line — tooltip shows
      `Unpinned: operator.victoriametrics.com@<latest> (latest from CDN)`.
- [ ] Autocomplete works on `spec.` properties.

### Picker (preview a different version)

- [ ] Click the status bar item.
- [ ] Confirm a quick-pick appears with the most-recent 5 versions and
      a "Show all <N> versions…" entry (when more than 5 exist).
- [ ] Type `68` (or another partial) → filtered list shows only matching versions.
- [ ] Clear the input → "recent 5 + Show all" restored.
- [ ] Pick "Show all" → full list appears in the same picker.
- [ ] Pick a non-current version → quick-pick closes, status bar
      flips to `$(eye) VMCluster · <picked>` (Preview).
- [ ] Reload the window — Preview clears; status bar back to `$(unlock)`.

### Pinned still wins

- [ ] In the same workspace add `schemalock.yaml` + `schemalock.lock`
      pinning `operator.victoriametrics.com@<some-older-version>`.
- [ ] Save → status bar transitions to `$(lock) VMCluster · <pinned-version>`.

### Error state

- [ ] Point `SCHEMALOCK_REGISTRY_BASE` at a bogus host (e.g.
      `http://127.0.0.1:1`) and reload.
- [ ] Open `vmcluster.yaml` in a no-lockfile workspace.
- [ ] Confirm status bar shows `$(warning) VMCluster` with a yellow
      background.
- [ ] Tooltip explains the failure.
- [ ] Click → an information dialog appears with "Retry / Show output / Cancel".
- [ ] Clear the env var, restart, click Retry → state returns to `$(unlock)`.

### Fallback disabled

- [ ] Set `schemalock.fallback.enabled` to `false` in settings.
- [ ] Reload.
- [ ] Open the same `vmcluster.yaml` in the no-lockfile workspace.
- [ ] Confirm: no schemalock status bar item (Unindexable), and the file
      is handled by yaml-language-server only.

## Sign-off

Before pushing to the Marketplace, confirm:

- [ ] All items above are checked on at least darwin-arm64 + linux-x64.
- [ ] `npm run lint && npm run compile && npm run bundle && npm test`
      exits 0.
- [ ] `npm run build:binaries` produces 5 binaries, each < 20 MB.
- [ ] `npm run package` produces 5 `.vsix` files.
- [ ] `CHANGELOG.md` entry for `0.2.0` is present and accurate.
- [ ] Git tag `v0.2.0` is ready to push after publish succeeds.
