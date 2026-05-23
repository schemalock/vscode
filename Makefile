# SchemaLock VS Code extension — release Makefile.
#
# Reads the version from package.json. Run `make help` for the target list,
# `make release` for a full one-shot release.

SHELL  := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

VERSION := $(shell node -p "require('./package.json').version")
TAG     := v$(VERSION)
VSIXES  := schemalock-*-$(VERSION).vsix

.DEFAULT_GOAL := help

.PHONY: help preflight bundle binaries package publish-vsce publish-ovsx publish tag gh-release release clean

help:
	@printf "SchemaLock VS Code extension — release targets\n\n"
	@printf "Current version: %s (tag %s)\n\n" "$(VERSION)" "$(TAG)"
	@printf "  make preflight     verify clean tree, branch=main, CHANGELOG entry exists\n"
	@printf "  make package       bundle + build 5 binaries + 5 VSIX (no publish)\n"
	@printf "  make publish       vsce + ovsx publish all 5 VSIX (needs VSCE_PAT, OVSX_PAT)\n"
	@printf "  make tag           create and push v\$$VERSION tag\n"
	@printf "  make gh-release    gh release create with the 5 VSIX attached\n"
	@printf "  make release       preflight → package → publish → tag → gh-release\n"
	@printf "  make clean         remove dist/, bin/, *.vsix\n\n"
	@printf "Required env for publish: VSCE_PAT (Visual Studio Marketplace), OVSX_PAT (Open VSX).\n"

preflight:
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "ERROR: working tree not clean"; exit 1; \
	fi
	@if [ "$$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then \
	  echo "ERROR: not on main branch (on $$(git rev-parse --abbrev-ref HEAD))"; exit 1; \
	fi
	@if ! grep -qE "^## $(VERSION)( |$$)" CHANGELOG.md; then \
	  echo "ERROR: CHANGELOG.md missing '## $(VERSION)' header"; exit 1; \
	fi
	@if git rev-parse "$(TAG)" >/dev/null 2>&1; then \
	  echo "ERROR: tag $(TAG) already exists"; exit 1; \
	fi
	@echo "preflight OK — version $(VERSION)"

bundle:
	node esbuild.js --minify

binaries:
	bash scripts/build-binaries.sh

package: bundle binaries
	bash scripts/package-all.sh

publish-vsce:
	@if [ -z "$${VSCE_PAT:-}" ]; then echo "ERROR: VSCE_PAT not set"; exit 1; fi
	@for vsix in $(VSIXES); do \
	  echo "==> vsce publish $$vsix"; \
	  npx vsce publish --packagePath "$$vsix" -p "$$VSCE_PAT" --no-dependencies; \
	done

publish-ovsx:
	@if [ -z "$${OVSX_PAT:-}" ]; then echo "ERROR: OVSX_PAT not set"; exit 1; fi
	@for vsix in $(VSIXES); do \
	  echo "==> ovsx publish $$vsix"; \
	  npx -y ovsx publish "$$vsix" -p "$$OVSX_PAT"; \
	done

publish: publish-vsce publish-ovsx

tag:
	git tag -a "$(TAG)" -m "$(TAG)"
	git push origin "$(TAG)"

gh-release:
	@awk -v ver="$(VERSION)" ' \
	  /^## / { if (in_section) exit; if ($$2 == ver) { in_section=1; next } } \
	  in_section { print } \
	' CHANGELOG.md > /tmp/schemalock-notes.md
	gh release create "$(TAG)" \
	  --title "$(TAG)" \
	  --notes-file /tmp/schemalock-notes.md \
	  $(VSIXES)

# Order: package (local build) → publish (irreversible marketplace state) →
# tag (matches what's now published) → gh-release. A publish failure leaves
# no tag pushed; re-run `make publish` then `make tag gh-release`.
release: preflight package publish tag gh-release
	@echo ""
	@echo "==> released $(TAG)"

clean:
	rm -f schemalock-vscode-*.vsix
	rm -rf dist bin
