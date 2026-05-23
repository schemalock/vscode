# Releasing

Manual, local, Makefile-driven. From a clean release-branch working tree:

```bash
make release
```

Reads `package.json` version and the app tag from `.app-version`, then runs
the full pipeline: preflight → package (5 platform VSIX, each bundling the
pinned app tag) → publish (Marketplace + Open VSX) → tag → GitHub release.

## Two-repo coordination

`vscode/` and `../app/` version **independently**. This repo's `.app-version`
file names which `app/` tag a release VSIX bundles.

| Change shape | vscode bump | app tag | `.app-version` |
|---|---|---|---|
| Extension-only (UI, README, activation) | yes | no | unchanged |
| App-only (LSP, schema resolution) | yes | yes | updated to new app tag |
| Both | yes | yes | updated to new app tag |

vscode bumps on **every** release — marketplace versions are immutable.
`.app-version` only moves when app changed.

## Local iteration

For smoke-testing without bumping versions:

```bash
make dev-vsix       # local-platform-only VSIX, version <base>-dev.<sha>
code --install-extension <result>.vsix --force
```

`make dev-vsix` ignores `.app-version` and builds against current `../app`
HEAD. The `-dev.<sha>` semver-prerelease tag prevents accidental publish.

## One-time setup

### Marketplace + Open VSX publishers

The publisher entities must exist before `vsce publish` / `ovsx publish`
will accept uploads:

- **Visual Studio Marketplace** — register `schemalock` publisher at
  <https://marketplace.visualstudio.com/manage>.
- **Open VSX** — claim the `schemalock` namespace at
  <https://open-vsx.org/user-settings/namespaces>.

### Tokens

Create PATs once:

| Variable | Source | Scope |
|---|---|---|
| `VSCE_PAT` | <https://dev.azure.com> → User Settings → Personal Access Tokens | Marketplace → Manage (organization: All accessible) |
| `OVSX_PAT` | <https://open-vsx.org/user-settings/tokens> | namespace publish |

Store in a per-repo `.envrc` (gitignored — see `.gitignore`):

```bash
# .envrc
export VSCE_PAT='...'
export OVSX_PAT='...'
```

With [direnv](https://direnv.net) installed, `cd vscode/` auto-loads
the variables. Then:

```bash
make release
```

## Release procedure

### App changed too (bundling a new app tag)

1. **In `../app/`** — branch the fix, merge to `master`, bump
   `cmd/schemalock/main.go` `var version`, add `## X.Y.Z` to
   `app/CHANGELOG.md`, tag `vX.Y.Z` annotated.
2. **In `vscode/`** — update `.app-version` to the new app tag (own commit).
3. Bump `package.json` version (e.g. `0.1.1` → `0.1.2`).
4. Add `## X.Y.Z — YYYY-MM-DD` to `CHANGELOG.md`. User-facing only.
5. Update install snippet in `README.md`.
6. Commit on a branch, merge `--no-ff` to `master`, `make release`.

### Extension-only (`.app-version` unchanged)

1. Bump `package.json`.
2. Add `## X.Y.Z` to `CHANGELOG.md`.
3. Update install snippet in `README.md`.
4. Commit on a branch, merge `--no-ff` to `master`, `make release`.

`make release` runs preflight: clean tree in both repos, vscode on
release branch with HEAD=`vX.Y.Z` matching `package.json`, app HEAD =
the tag in `.app-version`. Refuses if any check fails.

## Targets

```
make help          show targets + current version + pinned app tag
make dev-vsix      local-platform VSIX, version <base>-dev.<sha> (no publish)
make preflight     clean tree, branch, CHANGELOG, tag-not-taken, app pin check
make package       bundle + build 5 binaries (against pinned app tag) + 5 VSIX
make publish       vsce + ovsx publish all 5 VSIX
make tag           create + push vX.Y.Z annotated tag
make gh-release    gh release create attaching the 5 VSIX
make release       preflight → package → publish → tag → gh-release
make clean         remove dist/, bin/, *.vsix
```

## Partial-failure recovery

`make release` chains targets in order: **package → publish → tag →
gh-release**. Publish to the marketplace is irreversible, so it happens
*before* the tag is pushed; if publish fails mid-loop you have no
dangling tag.

| Failure | Recovery |
|---|---|
| `make preflight` fails | Fix the surfaced issue (dirty tree, wrong branch, missing CHANGELOG, tag taken). |
| `make package` fails | Fix the build, re-run `make release`. Nothing external touched yet. |
| `make publish-vsce` fails partway | Re-run `make publish-vsce` — vsce will reject already-published targets with a duplicate-version error; comment out the loop entries that succeeded or wait for the duplicate error to scroll past. Then `make publish-ovsx tag gh-release`. |
| `make publish-ovsx` fails partway | Same recovery shape as vsce. Then `make tag gh-release`. |
| `make tag` fails | Likely network or already-pushed. `git push origin v<X.Y.Z>` manually; then `make gh-release`. |
| `make gh-release` fails | Re-run it; or `gh release create v<X.Y.Z> ...` manually. |

Never `git tag -d` a tag that has been pushed and consumed by a downstream
release — instead, bump to the next version.

## When to revisit CI automation

This manual flow is the right choice while:
- One person ships releases
- PRs are rare
- Marketplace + Open VSX state is stable

Migrate to a GitHub Actions release workflow when any of those changes —
PR template, contributor onboarding, release rate >1/week, or you want
to ship from a tag-push instead of a workstation. The earlier draft of
that workflow + secret setup is preserved in the closed PR
<https://github.com/schemalock/vscode/pull/1> for reference.
