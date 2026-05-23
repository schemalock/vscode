import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  ErrorHandler,
  ErrorAction,
  CloseAction,
} from "vscode-languageclient/node";
import { resolveBinaryPath } from "./binary";
import { shouldRestart, RESTART_BUDGET } from "./restartBudget";
import { initStatusBar, setState } from "./status";
import * as documentStatus from "./documentStatus";

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel | undefined;
let activeBinaryPath: string | undefined;
let activeContext: vscode.ExtensionContext | undefined;
let crashTimestamps: number[] = [];

export interface ExtensionApi {
  /** Returns the running LanguageClient, or undefined before activation completes. */
  getClient(): LanguageClient | undefined;
  /** Returns the cached per-document state for the given URI, if known. */
  getDocumentState(uri: string): ReturnType<typeof documentStatus.getDocumentState>;
}

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionApi> {
  const api: ExtensionApi = {
    getClient: () => client,
    getDocumentState: (uri: string) => documentStatus.getDocumentState(uri),
  };

  outputChannel = vscode.window.createOutputChannel("SchemaLock");
  context.subscriptions.push(outputChannel);

  initStatusBar(context);
  setState("starting");
  outputChannel.appendLine("SchemaLock activating");

  void warnIfConflictingYamlExtension(context, outputChannel);

  activeContext = context;

  let binaryPath: string;
  try {
    const config = vscode.workspace.getConfiguration("schemalock");
    binaryPath = resolveBinaryPath(context, config);
  } catch (err) {
    const msg = `SchemaLock: binary not found — ${err instanceof Error ? err.message : String(err)}`;
    outputChannel.appendLine(msg);
    vscode.window.showErrorMessage(msg);
    setState("crashed", "binary not found");
    return api;
  }
  activeBinaryPath = binaryPath;
  outputChannel.appendLine(`[extension] binary: ${binaryPath}`);

  context.subscriptions.push(
    vscode.commands.registerCommand("schemalock.showOutput", () => {
      outputChannel?.show(true);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "schemalock.restartLanguageServer",
      async () => {
        if (!activeContext || !activeBinaryPath || !outputChannel) return;
        outputChannel.appendLine("[extension] restart requested by user");
        setState("starting");
        try {
          await stopClient();
          await startClient(activeContext, activeBinaryPath, outputChannel);
          setState("running");
          if (client) {
            documentStatus.activate(activeContext, client);
          }
          outputChannel.appendLine("[extension] restart complete");
        } catch (err) {
          const msg = `SchemaLock: restart failed — ${err instanceof Error ? err.message : String(err)}`;
          outputChannel.appendLine(msg);
          vscode.window.showErrorMessage(msg);
          setState("crashed", "restart failed");
        }
      }
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("schemalock.dumpCaches", async () => {
      if (!outputChannel) return;
      if (!client) {
        outputChannel.appendLine(
          "[dumpCaches] language client is not running"
        );
        outputChannel.show(true);
        return;
      }
      try {
        const snapshot = await client.sendRequest("schemalock/cacheDebug", {});
        outputChannel.appendLine("[dumpCaches] " + JSON.stringify(snapshot, null, 2));
      } catch (err) {
        outputChannel.appendLine(
          `[dumpCaches] failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      outputChannel.show(true);
    })
  );

  try {
    await startClient(context, binaryPath, outputChannel);
    setState("running");
    if (client) {
      documentStatus.activate(context, client);
    }
  } catch (err) {
    const msg = `SchemaLock: failed to start — ${err instanceof Error ? err.message : String(err)}`;
    outputChannel.appendLine(msg);
    vscode.window.showErrorMessage(msg);
    setState("crashed");
  }

  return api;
}

export async function deactivate(): Promise<void> {
  await stopClient();
}

async function startClient(
  context: vscode.ExtensionContext,
  binaryPath: string,
  channel: vscode.OutputChannel
): Promise<void> {
  crashTimestamps = [];

  const config = vscode.workspace.getConfiguration("schemalock");
  const yamlLanguageServerPath = config.get<string>("yamlLanguageServer.path", "");
  const fallbackEnabled = config.get<boolean>("fallback.enabled", true);

  channel.appendLine(`[extension] starting schemalock LSP: ${binaryPath}`);

  const serverOptions: ServerOptions = {
    command: binaryPath,
    args: ["serve", "--stdio"],
    options: { env: process.env },
  };

  const errorHandler: ErrorHandler = {
    error(err, _msg, count) {
      const c = count ?? 0;
      channel.appendLine(`[extension] LSP error (count=${c}): ${err.message}`);
      if (c <= 3) return { action: ErrorAction.Continue, handled: true };
      channel.appendLine("[extension] too many errors — shutting down");
      return { action: ErrorAction.Shutdown, handled: true };
    },
    closed() {
      const now = Date.now();
      const { restart, pruned } = shouldRestart(crashTimestamps, now);
      crashTimestamps = pruned;
      if (!restart) {
        channel.appendLine(`[extension] crashed ${RESTART_BUDGET}+ times in 60 s — giving up`);
        setState("crashed");
        vscode.window.showErrorMessage(
          "SchemaLock LSP keeps crashing. Check Output → SchemaLock."
        );
        return { action: CloseAction.DoNotRestart, handled: true };
      }
      channel.appendLine(
        `[extension] LSP closed — restarting (${crashTimestamps.length}/${RESTART_BUDGET})`
      );
      setState("restarting");
      return { action: CloseAction.Restart, handled: true };
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: "yaml" }],
    outputChannel: channel,
    traceOutputChannel: channel,
    initializationOptions: {
      yamlLanguageServer: { path: yamlLanguageServerPath },
      fallback: { enabled: fallbackEnabled },
    },
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher("**/schemalock.lock"),
    },
    errorHandler,
    middleware: buildCompletionMiddleware(),
  };

  client = new LanguageClient("schemalock", "SchemaLock", serverOptions, clientOptions);
  await client.start();
  channel.appendLine("[extension] language client started");
  context.subscriptions.push(client);
}

async function stopClient(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}

const CONFLICTING_EXTENSION_ID = "redhat.vscode-yaml";
const SUPPRESS_CONFLICT_WARNING_KEY = "schemalock.suppressYamlConflictWarning";

async function warnIfConflictingYamlExtension(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel
): Promise<void> {
  const conflict = vscode.extensions.getExtension(CONFLICTING_EXTENSION_ID);
  if (!conflict) return;

  if (context.globalState.get<boolean>(SUPPRESS_CONFLICT_WARNING_KEY)) {
    channel.appendLine(
      `[extension] ${CONFLICTING_EXTENSION_ID} is installed but warning is suppressed`
    );
    return;
  }

  channel.appendLine(
    `[extension] detected conflicting extension: ${CONFLICTING_EXTENSION_ID}`
  );

  const manage = "Manage Extension";
  const dontShow = "Don't show again";
  const choice = await vscode.window.showWarningMessage(
    "SchemaLock and Red Hat YAML are both active. They publish duplicate (and sometimes incorrect) diagnostics on the same YAML files. Disable Red Hat YAML for the best experience.",
    manage,
    dontShow
  );

  if (choice === manage) {
    await vscode.commands.executeCommand(
      "workbench.extensions.search",
      `@id:${CONFLICTING_EXTENSION_ID}`
    );
  } else if (choice === dontShow) {
    await context.globalState.update(SUPPRESS_CONFLICT_WARNING_KEY, true);
  }
}

/**
 * Completion middleware: forces a shared `filterText` when the server marks the
 * list incomplete (prevents VS Code's fuzzy ranking from overriding sortText),
 * and chains `editor.action.triggerParameterHints` on Field/Property items so
 * the next schema level pops automatically.
 */
function buildCompletionMiddleware(): LanguageClientOptions["middleware"] {
  return {
    provideCompletionItem: async (document, position, context, token, next) => {
      const list = await next(document, position, context, token);
      if (!list) return list;

      const items = Array.isArray(list) ? list : list.items;
      const isIncomplete = !Array.isArray(list) && list.isIncomplete === true;

      if (isIncomplete && items.length > 1) {
        const first = items[0];
        const hardcodedFilterText =
          first.filterText ??
          (typeof first.label === "string" ? first.label : first.label.label);
        for (const item of items) {
          item.filterText = hardcodedFilterText;
        }
      }

      const paramHintsEnabled = vscode.workspace
        .getConfiguration("editor.parameterHints", {
          languageId: "yaml",
          uri: document.uri,
        })
        .get<boolean>("enabled");
      if (paramHintsEnabled) {
        for (const item of items) {
          if (
            item.kind === vscode.CompletionItemKind.Field ||
            item.kind === vscode.CompletionItemKind.Property
          ) {
            if (item.command === undefined) {
              item.command = {
                title: "triggerParameterHints",
                command: "editor.action.triggerParameterHints",
              };
            }
          }
        }
      }

      return list;
    },
  };
}
