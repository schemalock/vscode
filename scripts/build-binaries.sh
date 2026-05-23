#!/usr/bin/env bash
# build-binaries.sh — cross-compile the schemalock binary for all supported
# VS Code extension target platforms.
#
# Requires: Go toolchain (go 1.20+ for -C flag; falls back to subshell for older)
# Output:   vscode/bin/<os>-<arch>/schemalock[.exe]
#
# Idempotent: re-running skips platforms whose output file already exists and
# is newer than the Go source. Pass --force to always rebuild.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="$(cd "${VSCODE_DIR}/../app" && pwd)"
BIN_DIR="${VSCODE_DIR}/bin"

FORCE=${1:-}

LDFLAGS="-s -w"

# Detect Go version to decide between -C flag (1.20+) and subshell.
GO_MAJOR=$(go version | grep -oE 'go[0-9]+\.[0-9]+' | head -1 | grep -oE '[0-9]+\.[0-9]+' | cut -d. -f1)
GO_MINOR=$(go version | grep -oE 'go[0-9]+\.[0-9]+' | head -1 | grep -oE '[0-9]+\.[0-9]+' | cut -d. -f2)
USE_C_FLAG=false
if [ "${GO_MAJOR}" -gt 1 ] || { [ "${GO_MAJOR}" -eq 1 ] && [ "${GO_MINOR}" -ge 20 ]; }; then
  USE_C_FLAG=true
fi

build_platform() {
  local goos="$1"
  local goarch="$2"
  local dir_name="$3"
  local binary_name="${4:-schemalock}"

  local out_dir="${BIN_DIR}/${dir_name}"
  local out_file="${out_dir}/${binary_name}"

  mkdir -p "${out_dir}"

  if [ -z "${FORCE}" ] && [ -f "${out_file}" ]; then
    # Check if source is newer than the binary.
    if find "${APP_DIR}" -name "*.go" -newer "${out_file}" | grep -q .; then
      echo "  rebuilding ${dir_name}/${binary_name} (source changed)"
    else
      echo "  skipping  ${dir_name}/${binary_name} (up to date)"
      return
    fi
  fi

  echo "  building  ${dir_name}/${binary_name}  (GOOS=${goos} GOARCH=${goarch})"
  if "${USE_C_FLAG}"; then
    GOOS="${goos}" GOARCH="${goarch}" go -C "${APP_DIR}" build \
      -ldflags="${LDFLAGS}" \
      -o "${out_file}" \
      ./cmd/schemalock
  else
    (cd "${APP_DIR}" && GOOS="${goos}" GOARCH="${goarch}" go build \
      -ldflags="${LDFLAGS}" \
      -o "${out_file}" \
      ./cmd/schemalock)
  fi
}

echo "Building schemalock binaries from ${APP_DIR} -> ${BIN_DIR}"

build_platform linux  amd64  linux-x64    schemalock
build_platform linux  arm64  linux-arm64  schemalock
build_platform darwin amd64  darwin-x64   schemalock
build_platform darwin arm64  darwin-arm64 schemalock
build_platform windows amd64 win32-x64   schemalock.exe

echo "Done."
