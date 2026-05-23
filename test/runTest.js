const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    // The folder containing the extension's package.json
    const extensionDevelopmentPath = path.resolve(__dirname, "..");

    // The path to the test runner script
    const extensionTestsPath = path.resolve(__dirname, "suite", "index");

    // Open workspace_good as the initial workspace so workspaceContains
    // activation events fire during the test run, and Workspace-scoped
    // settings can be written.
    const workspacePath = path.resolve(
      __dirname,
      "fixtures",
      "workspace_good"
    );

    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        "--disable-workspace-trust",
      ],
    });
  } catch (err) {
    console.error("Failed to run tests:", err);
    process.exit(1);
  }
}

main();
