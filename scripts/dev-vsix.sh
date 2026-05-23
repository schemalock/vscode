#!/usr/bin/env bash
# dev-vsix.sh — produce a local-platform .vsix for smoke testing.
#
# - Builds against current ../app HEAD (ignores .app-version)
# - Stamps the VSIX version as "<base>-dev.<app-sha>" (semver prerelease,
#   so vsce publish would reject it)
# - Bundles only the current platform's binary
# - Restores package.json to its original version on exit
#
# Output file: schemalock-<target>-<base>-dev.<sha>.vsix

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="$(cd "${VSCODE_DIR}/../app" && pwd)"

cd "${VSCODE_DIR}"

# Resolve current platform → vsce target name + bin dir.
case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux)  os=linux ;;
  MINGW*|MSYS*|CYGWIN*) os=windows ;;
  *) echo "ERROR: unsupported OS $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64)  arch=x64 ;;
  *) echo "ERROR: unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

case "${os}-${arch}" in
  darwin-arm64)  TARGET=darwin-arm64  ; BINARY=schemalock ;;
  darwin-x64)    TARGET=darwin-x64    ; BINARY=schemalock ;;
  linux-arm64)   TARGET=linux-arm64   ; BINARY=schemalock ;;
  linux-x64)     TARGET=linux-x64     ; BINARY=schemalock ;;
  windows-x64)   TARGET=win32-x64     ; BINARY=schemalock.exe ;;
  *) echo "ERROR: no vsce target for ${os}-${arch}" >&2; exit 1 ;;
esac

BASE_VERSION=$(node -p "require('./package.json').version")
APP_SHA=$(git -C "${APP_DIR}" rev-parse --short HEAD)
DEV_VERSION="${BASE_VERSION}-dev.${APP_SHA}"

echo "==> dev-vsix: target=${TARGET} version=${DEV_VERSION}"

# Step 1: bundle release-quality extension code.
echo "==> bundling extension"
node esbuild.js --minify

# Step 2: build only the local-platform binary in dev mode.
echo "==> building binary (BUILD_MODE=dev)"
BUILD_MODE=dev bash scripts/build-binaries.sh

# Step 3: temporarily bump package.json to the dev version.
echo "==> stamping package.json with ${DEV_VERSION}"
cp package.json package.json.bak
trap 'mv package.json.bak package.json; rm -rf bin && mv bin.bak bin 2>/dev/null || true' EXIT
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${DEV_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Step 4: stage bin/ to contain only the local platform's binary
# (mirrors package-all.sh: one binary per VSIX).
mv bin bin.bak
mkdir -p "bin/${TARGET}"
cp "bin.bak/${TARGET}/${BINARY}" "bin/${TARGET}/${BINARY}"

# Step 5: pack.
echo "==> packaging ${TARGET}"
npx vsce package --target "${TARGET}" --no-dependencies > /tmp/_vsce_out.txt 2>&1 || {
  cat /tmp/_vsce_out.txt
  echo "ERROR: vsce package failed" >&2
  exit 1
}
grep -E 'DONE|ERROR|WARNING' /tmp/_vsce_out.txt || true

OUT="schemalock-${TARGET}-${DEV_VERSION}.vsix"
if [ -f "${OUT}" ]; then
  echo ""
  echo "Built: ${OUT}"
  echo "Install: code --install-extension \"$(pwd)/${OUT}\" --force"
else
  echo "ERROR: expected ${OUT} not found" >&2
  ls -1 *.vsix 2>/dev/null >&2 || true
  exit 1
fi
