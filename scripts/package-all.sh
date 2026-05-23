#!/usr/bin/env bash
# package-all.sh — produce per-platform .vsix files, each containing exactly
# one binary matching the target platform.
#
# Strategy: before calling vsce package for each target, create a staging
# bin/ directory with only the relevant binary, then restore afterwards.
# This ensures the acceptance-criteria check (one binary per VSIX) passes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSCODE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${VSCODE_DIR}"

# Step 1: build the release extension bundle.
echo "==> bundling extension (release)"
node esbuild.js --minify

# Step 2: build binaries for all platforms.
echo "==> building binaries"
bash scripts/build-binaries.sh

# Step 3: package one .vsix per target, each with exactly one binary.
# Maps: vsix-target -> (bin-dir, binary-name)
declare -a TARGETS=(
  "linux-x64:linux-x64:schemalock"
  "linux-arm64:linux-arm64:schemalock"
  "darwin-x64:darwin-x64:schemalock"
  "darwin-arm64:darwin-arm64:schemalock"
  "win32-x64:win32-x64:schemalock.exe"
)

echo "==> packaging per-platform .vsix files"
for entry in "${TARGETS[@]}"; do
  IFS=':' read -r target bindir binary <<< "${entry}"
  echo "  packaging ${target} (bin from bin/${bindir}/${binary})"

  # Stash the full bin/ directory, create a staging one with just one binary.
  mv bin bin.bak
  mkdir -p "bin/${bindir}"
  cp "bin.bak/${bindir}/${binary}" "bin/${bindir}/${binary}"

  # Package.  Split into two commands to capture vsce's exit code correctly:
  # piping directly into grep would cause set -e to see only grep's exit code
  # (which is 0 whenever it finds a match), hiding a non-zero vsce exit.
  npx vsce package --target "${target}" --no-dependencies > /tmp/_vsce_out.txt 2>&1
  vsce_exit=$?
  grep -E 'DONE|ERROR|WARNING' /tmp/_vsce_out.txt || true
  if [ "${vsce_exit}" -ne 0 ]; then
    cat /tmp/_vsce_out.txt
    echo "ERROR: vsce package failed for target ${target} (exit ${vsce_exit})"
    exit "${vsce_exit}"
  fi

  # Restore.
  rm -rf bin
  mv bin.bak bin
done

echo "==> done"
echo ""
ls -lh "${VSCODE_DIR}"/*.vsix 2>/dev/null || echo "  (no .vsix files found — check vsce output above)"
