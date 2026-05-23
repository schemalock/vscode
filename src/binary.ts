import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/** Name of the schemalock binary (platform-aware). */
export function binaryName(): string {
  return process.platform === "win32" ? "schemalock.exe" : "schemalock";
}

/**
 * Resolve the path to the schemalock binary.
 *
 * Resolution order:
 * 1. `schemalock.binaryPath` setting (user override).
 * 2. Per-platform bundled binary under `<extensionPath>/bin/<os>-<arch>/`.
 *
 * Throws if the resolved path is not executable.
 */
export function resolveBinaryPath(
  context: vscode.ExtensionContext,
  config: vscode.WorkspaceConfiguration
): string {
  const override = config.get<string | null>("binaryPath");
  if (override && override.length > 0) {
    assertExecutable(override);
    return override;
  }

  // Map VS Code / Node platform+arch strings to the directory names used by
  // scripts/build-binaries.sh (e.g. "darwin-arm64", "linux-x64").
  const platformDir = `${process.platform}-${process.arch}`;
  const bundled = path.join(
    context.extensionPath,
    "bin",
    platformDir,
    binaryName()
  );
  assertExecutable(bundled);
  return bundled;
}

/**
 * Verify that `binaryPath` exists and is executable.
 * On Unix systems this also runs `chmod +x` to restore the executable bit that
 * VSIX extraction may have stripped.
 */
export function assertExecutable(binaryPath: string): void {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(
      `SchemaLock binary not found at: ${binaryPath}\n` +
        "Set 'schemalock.binaryPath' to override, or reinstall the extension."
    );
  }

  if (process.platform !== "win32") {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch {
      // Best-effort; access check below will catch real problems.
    }
  }

  try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
  } catch {
    throw new Error(
      `SchemaLock binary at ${binaryPath} is not executable.\n` +
        "Set 'schemalock.binaryPath' to override, or reinstall the extension."
    );
  }
}
