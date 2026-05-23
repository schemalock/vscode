/* eslint-disable */
"use strict";
/**
 * activation.test.js — verifies the extension activates and registers its
 * commands in a workspace that has NO schemalock.lock. CDN-fallback is
 * meant to handle the lockless case, so activation must proceed for the
 * new-user flow even when the lockfile is absent.
 *
 * runTest-lockless.js opens fixtures/workspace_no_lockfile as the
 * workspace root, so the activation event onLanguage:yaml is the only one
 * that fires.
 */

const assert = require("node:assert");
const vscode = require("vscode");
const path = require("node:path");

async function waitFor(predicate, ms, interval) {
  ms = ms ?? 10000;
  interval = interval ?? 200;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

suite("SchemaLock Activation — lockless workspace", function () {
  this.timeout(30000);

  test("activates and registers commands without a lockfile", async function () {
    // Open a YAML file to trigger onLanguage:yaml activation.
    const fixtureUri = vscode.Uri.file(
      path.join(
        vscode.workspace.workspaceFolders[0].uri.fsPath,
        "vmcluster.yaml"
      )
    );
    const doc = await vscode.workspace.openTextDocument(fixtureUri);
    await vscode.window.showTextDocument(doc);

    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    assert.ok(ext, "extension should be discoverable");
    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("schemalock.showOutput"),
      "schemalock.showOutput must be registered after activation in a lockless workspace"
    );
    assert.ok(
      commands.includes("schemalock.restartLanguageServer"),
      "schemalock.restartLanguageServer must be registered after activation in a lockless workspace"
    );

    // LanguageClient must come up — proves activation didn't early-return.
    const api = ext.exports;
    const ready = await waitFor(
      () => Promise.resolve(api && api.getClient() !== undefined),
      15000
    );
    assert.ok(
      ready,
      "LanguageClient must be available within 15 s after lockless activation"
    );
  });
});
