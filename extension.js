const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

const COMMANDS = {
  openViewer: "controller-view.openViewer",
  toggleAutoOpen: "controller-view.toggleAutoOpen",
};

const CONFIG_KEY = "controllerView";

// Cache the HTML template after first read
let cachedHtmlTemplate = null;

// Track the open panel
let currentPanel = null;

// Remember the last valid controller URI.
// Clicking the webview panel fires onDidChangeActiveTextEditor with
// editor === undefined — we must NOT treat that as "user left the file".
// Only dispose when a real, non-controller editor becomes active.
let lastValidDocUri = null;

function activate(context) {
  const isValidControllerFile = (document) => {
    if (!document || !document.uri.fsPath.endsWith(".json")) {
      return false;
    }
    try {
      const content = JSON.parse(document.getText());
      return (
        content.animation_controllers &&
        Object.keys(content.animation_controllers).length > 0
      );
    } catch {
      return false;
    }
  };

  // Resolve which controller name contains a given cursor line.
  // Mirrors the logic in script.js activeControllerName() so we can
  // compare server-side without round-tripping to the webview.
  const resolveActiveController = (json, cursorLine) => {
    try {
      const parsed = JSON.parse(json);
      const names = Object.keys(parsed.animation_controllers || {});
      if (names.length <= 1) return names[0] ?? null;

      const lines = json.split("\n");
      const keyLines = [];
      for (const name of names) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`"${escaped}"`);
        for (let i = 0; i < lines.length; i++) {
          if (re.test(lines[i])) { keyLines.push({ name, line: i }); break; }
        }
      }
      keyLines.sort((a, b) => a.line - b.line);
      let active = keyLines[0]?.name ?? names[0];
      for (const { name, line } of keyLines) {
        if (line <= cursorLine) active = name;
      }
      return active;
    } catch {
      return null;
    }
  };

  // Track last-sent state so we only post when something meaningful changed.
  let lastSentJson            = null;
  let lastSentControllerName  = null;

  const postUpdate = (panel, document, force = false) => {
    const editor = vscode.window.activeTextEditor;
    const cursorLine = (editor && editor.document === document)
      ? editor.selection.active.line
      : 0;

    const json            = document.getText();
    const controllerName  = resolveActiveController(json, cursorLine);
    const jsonChanged     = json !== lastSentJson;
    const controllerChanged = controllerName !== lastSentControllerName;

    // Skip the update if nothing the webview cares about has changed
    if (!force && !jsonChanged && !controllerChanged) return;

    lastSentJson           = json;
    lastSentControllerName = controllerName;

    panel.webview.postMessage({ type: "update", json, cursorLine });
  };

  const createPanel = (initialDocument) => {
    // Reset tracking state for the new panel
    lastSentJson           = null;
    lastSentControllerName = null;

    const panel = vscode.window.createWebviewPanel(
      "controller-view",
      "Animation Controller Graph",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "media")),
        ],
      }
    );

    panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

    if (initialDocument) {
      postUpdate(panel, initialDocument, true); // force first paint
    }

    // Update on document text changes (always re-render)
    const changeSubscription = vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (isValidControllerFile(event.document)) {
          postUpdate(panel, event.document);
        }
      }
    );

    // Update on cursor move — but postUpdate will no-op if the
    // focused controller hasn't changed
    const selectionSubscription = vscode.window.onDidChangeTextEditorSelection(
      (event) => {
        if (isValidControllerFile(event.textEditor.document)) {
          postUpdate(panel, event.textEditor.document);
        }
      }
    );

    panel.onDidDispose(() => {
      changeSubscription.dispose();
      selectionSubscription.dispose();
      currentPanel = null;
    });

    return panel;
  };

  // When switching editor tabs, update or close the panel accordingly.
  const activeEditorChangeSubscription = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (!editor) {
        // editor === undefined fires when focus moves to a non-editor surface,
        // most commonly the webview panel itself. Ignore it — we only want to
        // close when the user actually navigates to a different real file.
        return;
      }

      if (!isValidControllerFile(editor.document)) {
        // A real non-controller file was focused — close the panel.
        lastValidDocUri = null;
        if (currentPanel) {
          currentPanel.dispose(); // onDidDispose nulls currentPanel
        }
        return;
      }

      // Valid controller file focused.
      lastValidDocUri = editor.document.uri.toString();
      const config = vscode.workspace.getConfiguration(CONFIG_KEY);

      if (!currentPanel) {
        if (config.get("autoOpen") === true) {
          currentPanel = createPanel(editor.document);
        }
        return;
      }

      postUpdate(currentPanel, editor.document);
    }
  );

  // Manual open command
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.openViewer, () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showErrorMessage("Please open a JSON file first.");
        return;
      }

      if (!isValidControllerFile(editor.document)) {
        vscode.window.showErrorMessage(
          "This is not a valid animation controller file."
        );
        return;
      }

      if (currentPanel) {
        postUpdate(currentPanel, editor.document);
        currentPanel.reveal(vscode.ViewColumn.Beside, true);
        return;
      }

      currentPanel = createPanel(editor.document);
    })
  );

  // Toggle auto-open setting
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMANDS.toggleAutoOpen, async () => {
      const config = vscode.workspace.getConfiguration(CONFIG_KEY);
      const current = config.get("autoOpen", true);
      await config.update("autoOpen", !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `Controller View Auto Open is now ${!current ? "enabled" : "disabled"}.`
      );
    })
  );

  context.subscriptions.push(activeEditorChangeSubscription);

  // Auto-open on activation if setting is on
  const config = vscode.workspace.getConfiguration(CONFIG_KEY);
  const activeEditor = vscode.window.activeTextEditor;
  if (
    config.get("autoOpen") === true &&
    activeEditor &&
    isValidControllerFile(activeEditor.document)
  ) {
    lastValidDocUri = activeEditor.document.uri.toString();
    currentPanel = createPanel(activeEditor.document);
  }
}

function getWebviewContent(webview, extensionPath) {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "media", "script.js"))
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "media", "style.css"))
  );
  const resetStyleUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(extensionPath, "media", "reset.css"))
  );

  if (!cachedHtmlTemplate) {
    cachedHtmlTemplate = fs.readFileSync(
      path.join(extensionPath, "media", "index.html"),
      "utf8"
    );
  }

  return cachedHtmlTemplate
    .replace(/{{styleUri}}/g, styleUri)
    .replace(/{{scriptUri}}/g, scriptUri)
    .replace(/{{resetStyleUri}}/g, resetStyleUri);
}

module.exports = {
  activate,
  deactivate() {
    if (currentPanel) {
      currentPanel.dispose();
      currentPanel = null;
    }
  },
};