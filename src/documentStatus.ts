/**
 * documentStatus — second status bar item (per-document state) + version
 * picker. Sits left of the existing server-state item from status.ts.
 *
 * Talks to the schemalock binary via four custom LSP methods:
 *   schemalock/getDocumentState
 *   schemalock/listVersionsForGroup
 *   schemalock/setDocumentVersionOverride
 *   schemalock/retryResolve
 * and one notification:
 *   schemalock/documentStateChanged
 */

import * as vscode from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { buildPickerItems, PickerItem } from "./pickerItems";

const enum State {
  Unindexable = 0,
  Pinned = 1,
  Unpinned = 2,
  Preview = 3,
  Error = 4,
}

interface DocumentState {
  state: State;
  group?: string;
  kind?: string;
  version?: string;
  source?: string;
  errMsg?: string;
}

interface ListVersionsResponse {
  versions: string[];
  indexed: boolean;
}

const COMMAND_PICK = "schemalock.pickSchemaVersion";
const COMMAND_RETRY = "schemalock.retryResolve";

let item: vscode.StatusBarItem | undefined;
let client: LanguageClient | undefined;
let stateByUri: Map<string, DocumentState> | undefined;
let debounceTimer: NodeJS.Timeout | undefined;

export function activate(ctx: vscode.ExtensionContext, languageClient: LanguageClient): void {
  client = languageClient;
  stateByUri = new Map();
  item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  ctx.subscriptions.push(item);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => void refresh()),
    vscode.workspace.onDidChangeTextDocument(onTextChange),
    vscode.commands.registerCommand(COMMAND_PICK, openPicker),
    vscode.commands.registerCommand(COMMAND_RETRY, retryActive),
    languageClient.onNotification("schemalock/documentStateChanged", (params: DocumentState & { uri: string }) => {
      stateByUri!.set(params.uri, params);
      if (vscode.window.activeTextEditor?.document.uri.toString() === params.uri) {
        render(params);
      }
    }),
  );

  // Initial render.
  void refresh();
}

export function getDocumentState(uri: string): DocumentState | undefined {
  return stateByUri?.get(uri);
}

async function refresh(): Promise<void> {
  if (!item || !client) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "yaml") {
    item.hide();
    return;
  }
  const uri = editor.document.uri.toString();
  try {
    const resp = (await client.sendRequest("schemalock/getDocumentState", { uri })) as DocumentState;
    stateByUri!.set(uri, resp);
    render(resp);
  } catch {
    item.hide();
  }
}

function onTextChange(e: vscode.TextDocumentChangeEvent): void {
  if (e.document !== vscode.window.activeTextEditor?.document) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void refresh(), 250);
}

function render(s: DocumentState): void {
  if (!item) return;
  const kind = s.kind ?? "";
  const v = s.version ?? "";
  switch (s.state) {
    case State.Pinned:
      item.text = `$(lock) ${kind} · ${v}`;
      item.tooltip = `Pinned: ${s.group}@${v} (from schemalock.lock)`;
      item.backgroundColor = undefined;
      item.command = COMMAND_PICK;
      item.show();
      return;
    case State.Unpinned:
      item.text = `$(unlock) ${kind} · ${v}`;
      item.tooltip = `Unpinned: ${s.group}@${v} (latest from CDN)`;
      item.backgroundColor = undefined;
      item.command = COMMAND_PICK;
      item.show();
      return;
    case State.Preview:
      item.text = `$(eye) ${kind} · ${v}`;
      item.tooltip = `Preview: ${s.group}@${v} (this session only)`;
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      item.command = COMMAND_PICK;
      item.show();
      return;
    case State.Error:
      item.text = `$(warning) ${kind || s.group || "schemalock"}`;
      item.tooltip = `CDN unreachable: ${s.errMsg ?? "unknown error"}. Click to retry.`;
      item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      item.command = COMMAND_RETRY;
      item.show();
      return;
    case State.Unindexable:
    default:
      item.hide();
      return;
  }
}

async function openPicker(): Promise<void> {
  if (!client) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  const current = stateByUri?.get(uri);
  if (!current?.group) return;

  const list = (await client.sendRequest("schemalock/listVersionsForGroup", { group: current.group })) as ListVersionsResponse;
  if (!list.indexed) {
    void vscode.window.showInformationMessage(`No versions indexed for ${current.group}.`);
    return;
  }

  // showingAll latches once the user picks "Show all"; subsequent input edits
  // (including clearing the filter) keep the full list instead of reverting
  // to the recent-5 view. Cleared only when the picker is disposed.
  let showingAll = false;

  const qp = vscode.window.createQuickPick<PickerItem>();
  qp.placeholder = "Type to search all versions, or pick from recent";
  qp.matchOnDescription = true;
  qp.items = buildPickerItems(list.versions, current.version, "");
  qp.onDidChangeValue((value) => {
    if (showingAll && value.trim() === "") {
      // Preserve the full-list view; VS Code's built-in matcher still filters
      // the items as the user types.
      qp.items = list.versions.map((v) => ({
        label: v,
        description: v === current.version ? "current" : undefined,
      }));
      return;
    }
    qp.items = buildPickerItems(list.versions, current.version, value);
  });
  qp.onDidAccept(async () => {
    const sel = qp.selectedItems[0];
    if (!sel) {
      qp.dispose();
      return;
    }
    if (sel.showAll) {
      showingAll = true;
      qp.items = list.versions.map((v) => ({
        label: v,
        description: v === current.version ? "current" : undefined,
      }));
      return;
    }
    qp.dispose();
    const newVersion = sel.label === current.version ? "" : sel.label;
    await client!.sendRequest("schemalock/setDocumentVersionOverride", { uri, version: newVersion });
  });
  qp.show();
}

async function retryActive(): Promise<void> {
  if (!client) return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const uri = editor.document.uri.toString();
  const current = stateByUri?.get(uri);
  const pick = await vscode.window.showInformationMessage(
    `CDN unreachable for ${current?.group ?? "this group"}. Retry?`,
    "Retry",
    "Show output",
    "Cancel",
  );
  if (pick === "Retry") {
    await client.sendRequest("schemalock/retryResolve", { group: current?.group ?? "", uri });
  } else if (pick === "Show output") {
    void vscode.commands.executeCommand("schemalock.showOutput");
  }
}
