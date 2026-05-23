const path = require("path");
const { runTests } = require("@vscode/test-electron");

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, "..");
    const extensionTestsPath = path.resolve(__dirname, "suite-lockless", "index");
    const workspacePath = path.resolve(
      __dirname,
      "fixtures",
      "workspace_no_lockfile"
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
    console.error("Failed to run lockless tests:", err);
    process.exit(1);
  }
}

main();
