/* eslint-disable */
"use strict";
/**
 * documentStatus.test.js — integration test for registry-fallback document
 * status (Task 3.4).
 *
 * Starts a fake CDN HTTP server that serves a minimal schema for VMCluster,
 * points SCHEMALOCK_REGISTRY_BASE at it, restarts the language server so the
 * binary inherits the new env var, then asserts that opening a YAML file from
 * a workspace with no lockfile yields the Unpinned state (2).
 */

const assert = require("node:assert");
const vscode = require("vscode");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");

const FIXTURES = path.resolve(__dirname, "..", "fixtures");
const FIXTURE_FILE = path.join(FIXTURES, "workspace_no_lockfile", "vmcluster.yaml");

// State enum values (must match documentStatus.ts const enum State)
const State = {
  Unindexable: 0,
  Pinned: 1,
  Unpinned: 2,
  Preview: 3,
  Error: 4,
};

async function waitFor(predicate, ms, interval) {
  ms = ms ?? 20000;
  interval = interval ?? 300;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

suite("SchemaLock Document Status — registry fallback", function () {
  this.timeout(60000);

  let fakeCdn;
  let baseUrl;
  let prevEnv;

  suiteSetup(async function () {
    this.timeout(60000);

    const schemaBody = `{"type":"object"}`;
    const integ =
      "sha256-" +
      crypto.createHash("sha256").update(schemaBody).digest("base64");

    // Use a group that is NOT in workspace_good's schemalock.lock so the binary
    // cannot find a pinned entry and must fall back to the registry (CDN).
    fakeCdn = http.createServer((req, res) => {
      const url = req.url;
      if (url === "/kubernetes/operator.example.com/versions.json") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(`["0.70.0","0.68.4"]`);
      } else if (
        url ===
        "/kubernetes/operator.example.com/0.70.0/manifest.json"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            version: 1,
            kinds: {
              ExampleCluster: { integrity: integ, size: schemaBody.length },
            },
          })
        );
      } else if (
        url === "/kubernetes/operator.example.com/0.70.0/ExampleCluster.json"
      ) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(schemaBody);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((r) => fakeCdn.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${fakeCdn.address().port}`;

    // Persist old env value so we can restore it.
    prevEnv = process.env.SCHEMALOCK_REGISTRY_BASE;
    process.env.SCHEMALOCK_REGISTRY_BASE = baseUrl;

    // Restart the language server so the child process inherits the updated env.
    // The extension's startClient() passes { env: process.env } at spawn time,
    // so the binary only sees SCHEMALOCK_REGISTRY_BASE if it is set before the
    // spawn call — i.e., we must restart after setting the env var.
    await vscode.commands.executeCommand("schemalock.restartLanguageServer");

    // Wait for the LanguageClient to be available again after restart.
    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    const api = ext && (await ext.activate());
    const ready = await waitFor(
      () => Promise.resolve(api && api.getClient() !== undefined),
      30000
    );
    assert.ok(ready, "LanguageClient must be available within 30 s after restart");
  });

  suiteTeardown(async function () {
    if (fakeCdn) fakeCdn.close();
    if (prevEnv === undefined) {
      delete process.env.SCHEMALOCK_REGISTRY_BASE;
    } else {
      process.env.SCHEMALOCK_REGISTRY_BASE = prevEnv;
    }
  });

  test("shows Unpinned state for an indexable CRD with no lockfile", async function () {
    this.timeout(60000);

    const ext = vscode.extensions.getExtension("SchemaLock.schemalock");
    assert.ok(ext, "schemalock extension should be discoverable");
    const api = await ext.activate();
    assert.ok(
      api && typeof api.getDocumentState === "function",
      "extension API should expose getDocumentState"
    );

    const fixtureUri = vscode.Uri.file(FIXTURE_FILE);
    const doc = await vscode.workspace.openTextDocument(fixtureUri);
    await vscode.window.showTextDocument(doc);

    // Poll for the document state to be populated (the LSP binary resolves
    // the schema from the fake CDN asynchronously, either via
    // schemalock/getDocumentState request or via a documentStateChanged
    // notification).
    const docUriStr = fixtureUri.toString();
    const stateReady = await waitFor(async () => {
      const s = api.getDocumentState(docUriStr);
      return s !== undefined && s.state !== undefined;
    }, 20000);

    const state = api.getDocumentState(docUriStr);
    assert.ok(
      stateReady && state,
      `expected a documentState for ${docUriStr} within 20 s`
    );
    assert.strictEqual(
      state.state,
      State.Unpinned,
      `expected Unpinned (${State.Unpinned}), got ${state.state}`
    );
    assert.strictEqual(
      state.version,
      "0.70.0",
      `expected version 0.70.0, got ${state.version}`
    );
    assert.strictEqual(state.group, "operator.example.com");
    assert.strictEqual(state.kind, "ExampleCluster");
  });
});
