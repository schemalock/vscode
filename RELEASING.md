# Releasing

Manual, local, Makefile-driven. From a clean `main` working tree:

```bash
make release
```

Reads the version from `package.json` and runs the full pipeline:
preflight → package (5 platform VSIX) → publish (Marketplace + Open VSX) →
tag → GitHub release.

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

1. Bump `package.json` version (e.g. `0.3.3` → `0.3.4`).
2. Add a `## X.Y.Z — YYYY-MM-DD` section to `CHANGELOG.md`. User-facing
   only — no milestone codes, no codicons, no internal jargon.
3. Update the install snippet in `README.md` to the new version.
4. Commit on a branch, PR, merge `--no-ff` to `main`.
5. Pull `main`, then:
   ```bash
   make release   # direnv loads VSCE_PAT + OVSX_PAT from .envrc
   ```

## Targets

```
make help          show targets + current version
make preflight     clean tree + branch=main + CHANGELOG entry + tag-not-taken
make package       bundle + build 5 binaries + 5 VSIX (no network)
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
