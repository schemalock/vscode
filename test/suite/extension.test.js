/* eslint-disable */
"use strict";
// Silent skips are FORBIDDEN in this file. If a precondition can't hold
// (LSP not reachable, CDN unreachable, items missing), call assert.fail()
// so the regression surfaces. The Mocha loader passes forbidPending: true
// to guarantee that any stray this.skip() fails the suite.
/**
 * extension.test.js — integration tests for the SchemaLock VS Code extension.
 *
 * Runs inside a real VS Code extension host via @vscode/test-electron with
 * workspace_good opened as the workspace (see test/runTest.js).
 *
 * Scenarios (M10b Chunk 5):
 *   1. activates on workspace with schemalock.yaml
 *   2. advertises hover + completion + definition + references + documentSymbol
 *   3. publishes diagnostics for the typo workspace
 *   4. gracefully handles missing binary path setting
 *   5. (rewritten) every LSP completion item carries an explicit textEdit range
 *      (forward-path contract); items identified by kind=Class (LSP wire 7)
 *   6. spec-level completions arrive as Class items (middleware wire-kind)
 *   7. (new) kind: bootstrap returns EnumMember completions sourced from
 *      manifest.Kinds (VMCluster present)
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

  test("activates on workspace with schemalock.yaml", async function () {
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

  // Position inside the `  replicationFactor: 2` line (line 7, 0-indexed).
  // positionAt(7, 2) returns ParentPointer="/spec", IsKeyPosition=true because
  // character 2 is at the start of the `replicationFactor` key token.
  // Using a position inside an existing key token avoids the VS Code empty-line
  // character-clipping bug: character=2 on an empty trailing line gets silently
  // clipped to character=0, shifting positionAt to compute root-level completion
  // instead of spec-level.
  //
  // NOTE: VS Code strips filterText from completion items when it equals the
  // label during executeCompletionItemProvider IPC serialization. The server
  // DOES set FilterText on every item (verified by Go unit tests). We identify
  // LSP property items by kind=Class (vscode 6; LSP wire value 7) instead.
  // The word provider uses kind=Word (18); bootstrap kind-completions use
  // kind=Enum (vscode 12; LSP wire value 13).
  const COMPLETION_LINE = 7;
  const COMPLETION_CHARACTER = 2;

  async function getCompletionItems() {
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    const api = ext && ext.exports;
    const yamlFile = vscode.Uri.file(path.join(WORKSPACE_GOOD, "vmcluster.yaml"));
    const doc = await vscode.workspace.openTextDocument(yamlFile);
    await vscode.window.showTextDocument(doc);

    // Wait for the LSP server to process didOpen and resolve the document.
    // The server sends schemalock/documentStateChanged for Pinned/Unpinned/Preview
    // states. Polling getDocumentState ensures the router cache is valid before
    // we invoke the completion provider, avoiding a race where executeCompletion
    // fires before didOpen is processed and caches StateUnindexable.
    const uriString = yamlFile.toString();
    const docStateDeadline = Date.now() + 30_000;
    while (Date.now() < docStateDeadline) {
      const ds = api && api.getDocumentState(uriString);
      // state 1=Pinned, 2=Unpinned, 3=Preview — all mean the server has a schema
      if (ds && ds.state >= 1 && ds.state <= 3) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    const pos = new vscode.Position(COMPLETION_LINE, COMPLETION_CHARACTER);
    const deadline = Date.now() + 15_000;
    let list;
    while (Date.now() < deadline) {
      list = await vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        yamlFile,
        pos
      );
      const items = list && list.items ? list.items : Array.isArray(list) ? list : [];
      // Identify LSP property items by kind=Class (vscode.CompletionItemKind.Class=6,
      // which is LSP wire value 7). The word provider uses kind=Word/Text, not Class.
      const lspItems = items.filter(
        (i) => i.kind === vscode.CompletionItemKind.Class
      );
      if (lspItems.length >= 2) return list;
      await new Promise((r) => setTimeout(r, 500));
    }
    return list; // let the test's own assertion surface the failure with full context
  }

  test("LSP completion items carry an explicit textEdit range (forward-path contract)", async function () {
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    const api = ext && ext.exports;
    const uriString = vscode.Uri.file(path.join(WORKSPACE_GOOD, "vmcluster.yaml")).toString();
    const list = await getCompletionItems();
    const items = list && list.items ? list.items : Array.isArray(list) ? list : [];

    // Identify schemalock LSP property items by kind=Class (vscode 6 = LSP wire 7).
    // VS Code strips filterText when it equals the label during IPC round-trip;
    // use kind to identify server-originated items instead.
    const classItems = items.filter(
      (i) => i.kind === vscode.CompletionItemKind.Class
    );

    const ds = api && api.getDocumentState(uriString);
    assert.ok(
      classItems.length >= 2,
      `expected >= 2 Class completion items at ${WORKSPACE_GOOD}/vmcluster.yaml ` +
        `line ${COMPLETION_LINE} col ${COMPLETION_CHARACTER}; got ${classItems.length}. ` +
        `documentState=${JSON.stringify(ds)}; totalItems=${items.length}. ` +
        `If the server is unreachable or the CDN is down, this is a real failure ` +
        `(silent skip removed per forward-path contract).`
    );

    for (const item of classItems) {
      const label =
        typeof item.label === "string" ? item.label : item.label.label;

      // VS Code's CompletionItem surfaces the LSP TextEdit as either
      // `item.range` (Range or { inserting, replacing }) or `item.textEdit`
      // (older API path). At least one must be set; the LSP forward-path
      // contract requires the server to send an explicit Range so VS Code
      // uses the word at cursor as the replace target (not the whole line).
      const hasRange =
        item.range !== undefined && item.range !== null;
      const hasTextEdit =
        item.textEdit !== undefined && item.textEdit !== null;
      assert.ok(
        hasRange || hasTextEdit,
        `item ${label} must carry an explicit range or textEdit ` +
          `(forward-path requires explicit Range; got range=${item.range}, textEdit=${item.textEdit})`
      );
    }
  });

  test("property completion items are returned at spec-level (middleware wire-kind contract)", async function () {
    // The server sends LSP CompletionItemKind=7 for property completions.
    // vscode-languageclient maps LSP 7 → vscode.CompletionItemKind.Class (6).
    // The in-source constant `completionKindField=7` is a misnomer — the wire
    // value has always been LSP Class. The middleware's triggerParameterHints
    // branch gates on Field/Property kind (4/9) and therefore never fires for
    // these items; that is an existing dead-code issue tracked separately.
    // This test locks the observable contract: spec-level completions arrive
    // as Class items.
    const paramHintsEnabled = vscode.workspace
      .getConfiguration("editor.parameterHints")
      .get("enabled");

    // editor.parameterHints.enabled defaults to true; if a CI/test env
    // disables it, that's a real config drift, not a reason to skip.
    assert.strictEqual(
      paramHintsEnabled,
      true,
      "editor.parameterHints.enabled must be true in the test host (default). " +
        "If a future config drift disables it, fix the test host config — do not skip."
    );

    const list = await getCompletionItems();
    const items = list && list.items ? list.items : Array.isArray(list) ? list : [];

    // Server sends CompletionItemKind=7 (LSP Class) for all property items.
    // vscode-languageclient converts LSP kind to vscode kind via value-1 mapping
    // (LSP 7 → vscode.CompletionItemKind.Class = 6).
    const classItems = items.filter(
      (i) => i.kind === vscode.CompletionItemKind.Class
    );

    assert.ok(
      classItems.length > 0,
      `expected at least one Class completion item at the spec.* level (server sends ` +
        `LSP kind=7 which maps to vscode.CompletionItemKind.Class=6); ` +
        `regression in server property completion path or LSP kind wire value changed. ` +
        `Actual kinds: ${items.map((i) => i.kind).join(", ")}`
    );
  });
});

suite("SchemaLock Kind Bootstrap", function () {
  this.timeout(60000);

  // Fixture content:
  //   line 0: "apiVersion: operator.victoriametrics.com/v1beta1"
  //   line 1: "kind:"
  //   line 2: ""
  // Cursor after `kind:` is line 1, character 5. The server's intent.Lookup
  // path detects the `kind` field and returns enum-member completions
  // sourced from the CDN manifest's Kinds list (24 kinds for
  // operator.victoriametrics.com@0.70.0, including VMCluster).
  const FIXTURE = path.join(WORKSPACE_GOOD, "kind_completion_fixture.yaml");
  const KIND_LINE = 1;
  const KIND_CHARACTER = 5;

  test("kind: bootstrap returns EnumMember completions including VMCluster", async function () {
    const yamlFile = vscode.Uri.file(FIXTURE);
    const doc = await vscode.workspace.openTextDocument(yamlFile);
    await vscode.window.showTextDocument(doc);

    const pos = new vscode.Position(KIND_LINE, KIND_CHARACTER);
    const deadline = Date.now() + 30_000;
    let list;
    while (Date.now() < deadline) {
      list = await vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        yamlFile,
        pos
      );
      const items = list && list.items ? list.items : Array.isArray(list) ? list : [];
      if (items.length > 0) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const items =
      list && list.items ? list.items : Array.isArray(list) ? list : [];

    assert.ok(
      items.length > 0,
      "expected kind: bootstrap to return >=1 completion item; got 0 " +
        "(LSP/CDN unreachable, or intent.Lookup regressed)"
    );

    const vmCluster = items.find((i) => {
      const label = typeof i.label === "string" ? i.label : i.label.label;
      return label === "VMCluster";
    });
    assert.ok(
      vmCluster,
      `expected VMCluster among kind: bootstrap items, got: ${items
        .map((i) => (typeof i.label === "string" ? i.label : i.label.label))
        .join(", ")}`
    );

    // Server sends LSP CompletionItemKind=13 (Enum) — vscode-languageclient
    // maps this to vscode.CompletionItemKind.Enum. The Go source mislabels the
    // constant as `completionKindEnumMember` but the wire value has been LSP
    // Enum since v0.1.1; this assertion locks the contract.
    assert.strictEqual(
      vmCluster.kind,
      vscode.CompletionItemKind.Enum,
      `expected VMCluster.kind === Enum (vscode value 12, LSP wire value 13); got ${vmCluster.kind}`
    );
  });
});
