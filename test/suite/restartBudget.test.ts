/**
 * restartBudget.test.ts — unit tests for the shouldRestart helper.
 *
 * These tests are pure unit tests (no VS Code APIs needed) that verify the
 * restart-budget bookkeeping logic in isolation.
 *
 * NOTE: The test runner loads restartBudget.test.js.  This TypeScript source
 * documents types and intent for contributors.
 */

import * as assert from "assert";
import { shouldRestart, RESTART_BUDGET, RESTART_WINDOW_MS } from "../../src/restartBudget";

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
    // 4 recent (within window) + 2 old (outside window) → after pruning + new: 5 total → still under budget
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
