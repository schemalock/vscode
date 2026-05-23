#!/usr/bin/env bash
# build-binaries.sh — cross-compile the schemalock binary for the
# VS Code extension target platforms.
#
# Behaviour controlled by BUILD_MODE env var:
#   release (default): require ../app to be checked out at the annotated tag
#                       in vscode/.app-version, clean tree. Builds all five
#                       platforms. Injects the pinned semver into the binary.
#   dev               : ignore .app-version, build against current ../app HEAD.
#                       Injects "<base>-dev.<sha>" into the binary. Builds
#                       the local platform only.
#
# Output: vscode/bin/<os>-<arch>/schemalock[.exe]
#
# Idempotent: re-running skips platforms whose binary is newer than every
# Go source file. Pass --force as $1 to always rebuild.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="$(cd "${VSCODE_DIR}/../app" && pwd)"
BIN_DIR="${VSCODE_DIR}/bin"

FORCE=${1:-}
BUILD_MODE=${BUILD_MODE:-release}

APP_SHA_SHORT=$(git -C "${APP_DIR}" rev-parse --short HEAD)
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ "${BUILD_MODE}" = "dev" ]; then
  # Dev: derive version from .app-version base + -dev.<sha>. .app-version
  # missing or unparsable falls back to 0.0.0.
  if [ -f "${VSCODE_DIR}/.app-version" ]; then
    PIN_BASE=$(tr -d '[:space:]' < "${VSCODE_DIR}/.app-version" | sed 's/^v//')
  else
    PIN_BASE="0.0.0"
  fi
  APP_VERSION="${PIN_BASE}-dev.${APP_SHA_SHORT}"
  echo "BUILD_MODE=dev — building against ../app HEAD (${APP_SHA_SHORT})"
elif [ "${BUILD_MODE}" = "release" ]; then
  if [ ! -f "${VSCODE_DIR}/.app-version" ]; then
    echo "ERROR: vscode/.app-version missing — required for release builds" >&2
    exit 1
  fi
  PIN_TAG=$(tr -d '[:space:]' < "${VSCODE_DIR}/.app-version")
  ACTUAL_TAG=$(git -C "${APP_DIR}" describe --exact-match --tags HEAD 2>/dev/null || echo "")
  if [ "${ACTUAL_TAG}" != "${PIN_TAG}" ]; then
    echo "ERROR: ../app HEAD is at '${ACTUAL_TAG:-untagged}', .app-version pins '${PIN_TAG}'" >&2
    echo "       cd ${APP_DIR} && git checkout ${PIN_TAG}" >&2
    exit 1
  fi
  if [ -n "$(git -C "${APP_DIR}" status --porcelain)" ]; then
    echo "ERROR: ../app working tree is not clean" >&2
    git -C "${APP_DIR}" status --short >&2
    exit 1
  fi
  APP_VERSION="${PIN_TAG#v}"
  echo "BUILD_MODE=release — ../app at tag ${PIN_TAG} (${APP_SHA_SHORT})"
else
  echo "ERROR: BUILD_MODE must be 'release' or 'dev' (got '${BUILD_MODE}')" >&2
  exit 1
fi

LDFLAGS="-s -w -X main.version=${APP_VERSION} -X main.commit=${APP_SHA_SHORT} -X main.buildTime=${BUILD_TIME}"

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
echo "  version=${APP_VERSION} commit=${APP_SHA_SHORT} buildTime=${BUILD_TIME}"

if [ "${BUILD_MODE}" = "dev" ]; then
  # Auto-detect local platform; dev mode never cross-compiles.
  case "$(uname -s)" in
    Darwin)  os=darwin ;;
    Linux)   os=linux ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *)       echo "ERROR: unsupported OS $(uname -s)" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch=arm64 ;;
    x86_64|amd64)  arch=amd64 ;;
    *)             echo "ERROR: unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac
  case "${os}-${arch}" in
    linux-amd64)   build_platform linux  amd64 linux-x64    schemalock ;;
    linux-arm64)   build_platform linux  arm64 linux-arm64  schemalock ;;
    darwin-amd64)  build_platform darwin amd64 darwin-x64   schemalock ;;
    darwin-arm64)  build_platform darwin arm64 darwin-arm64 schemalock ;;
    windows-amd64) build_platform windows amd64 win32-x64  schemalock.exe ;;
    *) echo "ERROR: no mapping for ${os}-${arch}" >&2; exit 1 ;;
  esac
else
  build_platform linux  amd64  linux-x64    schemalock
  build_platform linux  arm64  linux-arm64  schemalock
  build_platform darwin amd64  darwin-x64   schemalock
  build_platform darwin arm64  darwin-arm64 schemalock
  build_platform windows amd64 win32-x64   schemalock.exe
fi

echo "Done."
