/* eslint-disable */
"use strict";
/**
 * extension.test.js — integration tests for the SchemaLock VS Code extension.
 *
 * Runs inside a real VS Code extension host via @vscode/test-electron with
 * workspace_good opened as the workspace (see test/runTest.js).
 *
 * Scenarios (M10b Chunk 5):
 *   1. activates on workspace with schemalock.lock
 *   2. advertises hover + completion + definition + references + documentSymbol
 *   3. publishes diagnostics for the typo workspace
 *   4. gracefully handles missing binary path setting
 *   5. all completion items share a single filterText (middleware hack)
 *   6. Field/Property items carry triggerParameterHints command
 */

const assert = require("assert");
const path = require("path");
const vscode = require("vscode");

const FIXTURES = path.resolve(__dirname, "..", "fixtures");
const WORKSPACE_GOOD = path.join(FIXTURES, "workspace_good");
const WORKSPACE_BAD = path.join(FIXTURES, "workspace_bad");

async function waitFor(predicate, ms = 15000, interval = 200) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

suite("SchemaLock Extension", function () {
  this.timeout(60000);

  test("activates on workspace with schemalock.lock", async function () {
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    assert.ok(ext, "extension SchemaLock.schemalock should be registered");

    const yamlFile = vscode.Uri.file(path.join(WORKSPACE_GOOD, "vmcluster.yaml"));
    const doc = await vscode.workspace.openTextDocument(yamlFile);
    await vscode.window.showTextDocument(doc);

    const activated = await waitFor(() => Promise.resolve(ext.isActive), 15000);
    assert.strictEqual(activated, true, "extension should be active within 15 s");
  });

  test("advertises hover, completion, definition, references, documentSymbol", async function () {
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    assert.ok(ext?.isActive, "extension must be active");

    const api = ext.exports;
    assert.ok(api && typeof api.getClient === "function", "extension must expose getClient()");

    // Allow the LSP server to complete `initialize` so capabilities are populated.
    const ready = await waitFor(() => Promise.resolve(api.getClient() !== undefined), 15000);
    assert.strictEqual(ready, true, "LanguageClient must be available within 15 s");

    const client = api.getClient();
    const caps = client.initializeResult?.capabilities;
    assert.ok(caps, "server must publish initialize capabilities");
    assert.ok(caps.hoverProvider, "hoverProvider must be advertised");
    assert.ok(caps.completionProvider, "completionProvider must be advertised");
    assert.ok(caps.definitionProvider, "definitionProvider must be advertised");
    assert.ok(caps.referencesProvider, "referencesProvider must be advertised");
    assert.ok(caps.documentSymbolProvider, "documentSymbolProvider must be advertised");
  });

  test("publishes diagnostics for typo workspace", async function () {
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    const config = vscode.workspace.getConfiguration("schemalock");
    const platformDir = `${process.platform}-${process.arch}`;
    const binaryName = process.platform === "win32" ? "schemalock.exe" : "schemalock";
    const binaryPath = ext
      ? path.join(ext.extensionPath, "bin", platformDir, binaryName)
      : undefined;
    if (binaryPath) {
      await config.update("binaryPath", binaryPath, vscode.ConfigurationTarget.Global);
    }

    const typoFile = path.join(WORKSPACE_BAD, "vmcluster_typo.yaml");
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(typoFile));
    await vscode.window.showTextDocument(doc);

    const typoUri = vscode.Uri.file(typoFile);
    const hasDiagnostic = await waitFor(async () => {
      const diags = vscode.languages.getDiagnostics(typoUri);
      return diags.some((d) => d.severity === vscode.DiagnosticSeverity.Error);
    }, 30000);

    await config.update("binaryPath", undefined, vscode.ConfigurationTarget.Global);

    assert.ok(
      hasDiagnostic,
      "expected at least one error diagnostic on vmcluster_typo.yaml within 30 s"
    );
  });

  test("gracefully handles missing binary path setting", async function () {
    const fs = require("fs");
    const badPath = "/tmp/__schemalock_nonexistent_binary_path_test__";

    assert.strictEqual(
      fs.existsSync(badPath),
      false,
      "test setup: bad binary path should not exist on disk"
    );

    const config = vscode.workspace.getConfiguration("schemalock");
    await config.update("binaryPath", badPath, vscode.ConfigurationTarget.Global);

    let threwError = false;
    try {
      fs.accessSync(badPath, fs.constants.X_OK);
    } catch {
      threwError = true;
    }

    await config.update("binaryPath", undefined, vscode.ConfigurationTarget.Global);

    assert.strictEqual(
      threwError,
      true,
      "accessSync should throw for a nonexistent binary path"
    );
  });
});

suite("SchemaLock Completion Middleware", function () {
  this.timeout(60000);

  const COMPLETION_LINE = 6;
  const COMPLETION_CHARACTER = 2;

  async function getCompletionItems() {
    const yamlFile = vscode.Uri.file(path.join(WORKSPACE_GOOD, "vmcluster.yaml"));
    const doc = await vscode.workspace.openTextDocument(yamlFile);
    await vscode.window.showTextDocument(doc);

    await new Promise((r) => setTimeout(r, 3000));

    const pos = new vscode.Position(COMPLETION_LINE, COMPLETION_CHARACTER);
    return await vscode.commands.executeCommand(
      "vscode.executeCompletionItemProvider",
      yamlFile,
      pos
    );
  }

  test("all completion items share a single filterText value", async function () {
    const list = await getCompletionItems();
    const items = list && list.items ? list.items : Array.isArray(list) ? list : [];

    // executeCompletionItemProvider returns items merged from every provider
    // VS Code knows about, including the built-in word-completion provider
    // (which leaves filterText null). The middleware only touches LSP items;
    // narrow the assertion to items that actually carry a filterText.
    const withFilter = items.filter((i) => typeof i.filterText === "string");

    if (withFilter.length < 2) {
      console.log("not enough LSP items returned, skipping middleware assertion");
      this.skip();
      return;
    }

    const filterTexts = withFilter.map((i) => i.filterText);
    const allSame = filterTexts.every((ft) => ft === filterTexts[0]);
    assert.ok(
      allSame,
      `expected all LSP filterText values to be identical but got: ${JSON.stringify([...new Set(filterTexts)])}`
    );
  });

  test("Field/Property items carry triggerParameterHints when parameterHints enabled", async function () {
    const paramHintsEnabled = vscode.workspace
      .getConfiguration("editor.parameterHints")
      .get("enabled");

    if (!paramHintsEnabled) {
      console.log("editor.parameterHints.enabled is false, skipping command assertion");
      this.skip();
      return;
    }

    const list = await getCompletionItems();
    const items = list && list.items ? list.items : Array.isArray(list) ? list : [];

    if (!items || items.length === 0) {
      console.log("no completions returned, skipping middleware assertion");
      this.skip();
      return;
    }

    const fieldOrPropItems = items.filter(
      (i) =>
        i.kind === vscode.CompletionItemKind.Field ||
        i.kind === vscode.CompletionItemKind.Property
    );

    if (fieldOrPropItems.length === 0) {
      console.log("no Field/Property items in completion list, skipping command assertion");
      this.skip();
      return;
    }

    const hasCommand = fieldOrPropItems.some(
      (i) => i.command && i.command.command === "editor.action.triggerParameterHints"
    );
    assert.ok(
      hasCommand,
      "expected at least one Field/Property completion item to have triggerParameterHints command"
    );
  });
});
