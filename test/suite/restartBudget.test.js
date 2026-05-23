/* eslint-disable */
"use strict";
/**
 * restartBudget.test.js — unit tests for the shouldRestart helper.
 *
 * Pure unit tests with no VS Code API dependencies.  The restartBudget module
 * is built by esbuild as a standalone CJS module at dist/restartBudget.js so
 * that these tests can require it directly inside the VS Code extension host
 * test runner.
 */

const assert = require("assert");
const path = require("path");

// Require the compiled restartBudget module.
const { shouldRestart, RESTART_BUDGET, RESTART_WINDOW_MS } = require(
  path.resolve(__dirname, "..", "..", "dist", "restartBudget")
);

suite("shouldRestart", function () {
  test("empty timestamps + new timestamp → restart true, pruned has 1 entry", function () {
    const now = Date.now();
    const { restart, pruned } = shouldRestart([], now);
    assert.strictEqual(restart, true, "should restart on first crash");
    assert.strictEqual(pruned.length, 1, "pruned array should contain the new timestamp");
    assert.strictEqual(pruned[0], now, "pruned[0] should equal now");
  });

  test("5 timestamps within window + new → restart false, budget exhausted", function () {
    const now = Date.now();
    // Create RESTART_BUDGET timestamps within the rolling window.
    const recent = Array.from({ length: RESTART_BUDGET }, (_, i) => now - i * 1000);
    const { restart, pruned } = shouldRestart(recent, now);
    assert.strictEqual(restart, false, "should not restart after budget exhausted");
    assert.strictEqual(
      pruned.length,
      RESTART_BUDGET + 1,
      "pruned should contain all recent timestamps plus the new one"
    );
  });

  test("old timestamps outside window are pruned", function () {
    const now = Date.now();
    // Timestamps older than RESTART_WINDOW_MS should be dropped.
    const old = [now - RESTART_WINDOW_MS - 1000, now - RESTART_WINDOW_MS - 500];
    const { restart, pruned } = shouldRestart(old, now);
    // Only the new timestamp 'now' survives (the old ones are pruned).
    assert.strictEqual(pruned.length, 1, "old timestamps should be pruned");
    assert.strictEqual(restart, true, "should restart after old timestamps are pruned");
  });

  test("mix of old and recent timestamps — only recent ones count", function () {
    const now = Date.now();
    // 4 recent (within window) + 2 old (outside window) → after pruning + new: 5 total
    // → exactly at limit, should still restart (budget = 5, count = 5 → restart true)
    const recent = Array.from({ length: RESTART_BUDGET - 1 }, (_, i) => now - i * 1000);
    const old = [now - RESTART_WINDOW_MS - 1, now - RESTART_WINDOW_MS - 2];
    const { restart, pruned } = shouldRestart([...old, ...recent], now);
    // After pruning old ones: RESTART_BUDGET - 1 remain, add now = RESTART_BUDGET → exactly at limit
    assert.strictEqual(
      pruned.length,
      RESTART_BUDGET,
      "pruned array should have exactly RESTART_BUDGET entries"
    );
    assert.strictEqual(restart, true, "budget not yet exhausted at exact limit");
  });
});

suite("SchemaLock Commands", function () {
  this.timeout(10000);

  test("schemalock.restartLanguageServer command is registered", async function () {
    const vscode = require("vscode");
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("schemalock.restartLanguageServer"),
      "schemalock.restartLanguageServer should be registered"
    );
  });

  test("schemalock.showOutput command is registered", async function () {
    const vscode = require("vscode");
    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("schemalock.showOutput"),
      "schemalock.showOutput should be registered"
    );
  });
});
