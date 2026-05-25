# SchemaLock VS Code extension — release Makefile.
#
# Reads the version from package.json and the bundled app tag from
# .app-version. Run `make help` for the target list, `make release` for
# a full one-shot release.

SHELL  := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c

VERSION := $(shell node -p "require('./package.json').version")
TAG     := v$(VERSION)
APP_TAG := $(shell tr -d '[:space:]' < .app-version 2>/dev/null || echo "MISSING")
VSIXES  := schemalock-*-$(VERSION).vsix
APP_DIR := ../app

.DEFAULT_GOAL := help

.PHONY: help dev-vsix dev-test preflight bundle binaries package publish-vsce publish-ovsx publish tag gh-release release clean

help:
	@printf "SchemaLock VS Code extension — release targets\n\n"
	@printf "Current vscode version: %s (tag %s)\n" "$(VERSION)" "$(TAG)"
	@printf "Pinned app tag        : %s\n\n" "$(APP_TAG)"
	@printf "  make dev-vsix      local-platform VSIX for smoke testing (no preflight, no publish)\n"
	@printf "  make dev-test      rebuild bundled binary from ../app HEAD + run tests (dev iteration)\n"
	@printf "  make preflight     clean trees + branches + CHANGELOG + tag-not-taken + .app-version pin\n"
	@printf "  make package       bundle + build 5 binaries (against pinned app tag) + 5 VSIX\n"
	@printf "  make publish       vsce + ovsx publish all 5 VSIX (needs VSCE_PAT, OVSX_PAT)\n"
	@printf "  make tag           create + push v\$$VERSION tag\n"
	@printf "  make gh-release    gh release create with the 5 VSIX attached\n"
	@printf "  make release       preflight → package → publish → tag → gh-release\n"
	@printf "  make clean         remove dist/, bin/, *.vsix\n\n"
	@printf "Required env for publish: VSCE_PAT (Visual Studio Marketplace), OVSX_PAT (Open VSX).\n"

dev-vsix:
	bash scripts/dev-vsix.sh

# dev-test: rebuild the bundled darwin-arm64 binary from ../app HEAD then run
# vscode tests. Use this when iterating against unreleased app/ changes —
# release uses the .app-version-pinned binary instead (see preflight).
#
# Hardcoded to darwin-arm64 because (a) the only developer machines that hit
# this target are macOS arm64, and (b) cross-compile fan-out is owned by
# scripts/build-binaries.sh which is what `make release` calls.
dev-test:
	@echo "==> rebuilding bundled binary from ../app HEAD (darwin-arm64)"
	cd $(APP_DIR) && go build -o ../vscode/bin/darwin-arm64/schemalock ./cmd/schemalock
	npm run compile
	npm run lint
	npm run bundle
	npm test

preflight:
	@if [ ! -f .app-version ]; then \
	  echo "ERROR: .app-version file missing"; exit 1; \
	fi
	@if [ "$(APP_TAG)" = "MISSING" ] || [ -z "$(APP_TAG)" ]; then \
	  echo "ERROR: .app-version is empty"; exit 1; \
	fi
	@if [ -n "$$(git status --porcelain)" ]; then \
	  echo "ERROR: vscode working tree not clean"; exit 1; \
	fi
	@branch=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$branch" != "master" ] && [ "$$branch" != "main" ]; then \
	  echo "ERROR: not on release branch (on $$branch)"; exit 1; \
	fi
	@if ! grep -qE "^## $(VERSION)( |$$)" CHANGELOG.md; then \
	  echo "ERROR: CHANGELOG.md missing '## $(VERSION)' header"; exit 1; \
	fi
	@if git rev-parse "$(TAG)" >/dev/null 2>&1; then \
	  echo "ERROR: vscode tag $(TAG) already exists"; exit 1; \
	fi
	@if [ -n "$$(git -C $(APP_DIR) status --porcelain)" ]; then \
	  echo "ERROR: ../app working tree not clean"; exit 1; \
	fi
	@actual=$$(git -C $(APP_DIR) describe --exact-match --tags HEAD 2>/dev/null || echo ""); \
	if [ "$$actual" != "$(APP_TAG)" ]; then \
	  echo "ERROR: ../app HEAD is at '$${actual:-untagged}', .app-version pins '$(APP_TAG)'"; \
	  echo "       cd $(APP_DIR) && git checkout $(APP_TAG)"; \
	  exit 1; \
	fi
	@if ! git -C $(APP_DIR) rev-parse "$(APP_TAG)^{tag}" >/dev/null 2>&1; then \
	  echo "ERROR: ../app $(APP_TAG) is not an annotated tag"; exit 1; \
	fi
	@echo "preflight OK — vscode $(VERSION) bundling app $(APP_TAG)"

bundle:
	node esbuild.js --minify

binaries:
	BUILD_MODE=release bash scripts/build-binaries.sh

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
