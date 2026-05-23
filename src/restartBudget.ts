/**
 * restartBudget.ts — pure helpers for LSP crash-restart bookkeeping.
 *
 * Extracted from standalone.ts so that the restart-budget logic can be unit
 * tested in isolation, without standing up a real LanguageClient.
 */

/** Maximum number of crashes allowed within RESTART_WINDOW_MS. */
export const RESTART_BUDGET = 5;

/** Rolling window (ms) within which crashes are counted. */
export const RESTART_WINDOW_MS = 60_000;

/**
 * Given the existing crash timestamps and the current timestamp, decide
 * whether the LSP client should be restarted.
 *
 * @param timestamps - Array of previous crash timestamps (epoch ms).  May
 *   contain timestamps outside the rolling window; they are pruned here.
 * @param now        - Current time in epoch ms (usually Date.now()).
 * @returns
 *   - `restart`  – true if the client should restart, false if budget is
 *     exhausted.
 *   - `pruned`   – the updated timestamps array, with stale entries removed
 *     and `now` appended.
 */
export function shouldRestart(
  timestamps: number[],
  now: number
): { restart: boolean; pruned: number[] } {
  // Drop timestamps outside the rolling window.
  const pruned = timestamps.filter((t) => now - t < RESTART_WINDOW_MS);
  // Append the current crash.
  pruned.push(now);
  const restart = pruned.length <= RESTART_BUDGET;
  return { restart, pruned };
}
