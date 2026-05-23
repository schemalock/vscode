/**
 * status.ts — SchemaLock status bar item.
 *
 * Provides a persistent status bar item that reflects the current state of the
 * SchemaLock extension (starting, running, restarting, crashed, or off).
 * Clicking the item invokes schemalock.showOutput.
 */

import * as vscode from "vscode";

/** Possible states for the status bar item. */
export type StatusState =
  | "starting"
  | "running"
  | "restarting"
  | "crashed"
  | "off";

let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Create the status bar item and register it with the extension context so it
 * is disposed when the extension deactivates.
 *
 * Must be called once during extension activation before any setState calls.
 */
export function initStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.command = "schemalock.showOutput";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

/**
 * Update the status bar item to reflect the given state.
 *
 * Safe to call before initStatusBar (no-op until the item is created).
 *
 * @param state   - New state.
 * @param detail  - Optional detail appended to the tooltip.
 */
export function setState(state: StatusState, detail?: string): void {
  if (!statusBarItem) {
    return;
  }

  switch (state) {
    case "starting":
      statusBarItem.text = "$(sync~spin) SchemaLock";
      statusBarItem.tooltip = "SchemaLock: starting…" + (detail ? ` — ${detail}` : "");
      statusBarItem.backgroundColor = undefined;
      break;

    case "running":
      statusBarItem.text = "$(check) SchemaLock";
      statusBarItem.tooltip = "SchemaLock: running" + (detail ? ` — ${detail}` : "");
      statusBarItem.backgroundColor = undefined;
      break;

    case "restarting":
      statusBarItem.text = "$(sync~spin) SchemaLock";
      statusBarItem.tooltip = "SchemaLock: restarting…" + (detail ? ` — ${detail}` : "");
      statusBarItem.backgroundColor = undefined;
      break;

    case "crashed":
      statusBarItem.text = "$(warning) SchemaLock";
      statusBarItem.tooltip =
        "SchemaLock: crashed — click to view output" +
        (detail ? ` — ${detail}` : "");
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      break;

    case "off":
      statusBarItem.text = "$(circle-slash) SchemaLock";
      statusBarItem.tooltip = "SchemaLock: inactive" + (detail ? ` — ${detail}` : "");
      statusBarItem.backgroundColor = undefined;
      break;
  }
}
