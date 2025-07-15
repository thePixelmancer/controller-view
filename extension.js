const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

// Track if the panel is currently open
let currentPanel = null;

function activate(context) {
  // Function to check if a file is a valid controller file
  const isValidControllerFile = (document) => {
    if (!document || !document.uri.fsPath.endsWith(".json")) {
      return false;
    }

    try {
      const content = JSON.parse(document.getText());
      // Check if it's a valid controller file (you can customize this logic)
      return content.animation_controllers && Object.keys(content.animation_controllers).length > 0;
    } catch (error) {
      return false;
    }
  };

  // Function to create and show the webview panel
  const createPanel = () => {
    const panel = vscode.window.createWebviewPanel(
      "controller-view",
      "Animation Controller Graph",
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "media"))],
      }
    );

    // Load the initial HTML content into the webview
    panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

    // Function to update the webview content
    const updateWebview = () => {
      const newEditor = vscode.window.activeTextEditor;
      if (newEditor && isValidControllerFile(newEditor.document)) {
        panel.webview.postMessage({
          type: "update",
          json: newEditor.document.getText(),
        });
      }
    };

    // Subscribe to changes in the document
    const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document && isValidControllerFile(event.document)) {
        updateWebview();
      }
    });

    // Update the webview with the initial content
    updateWebview();

    // Clean up when the webview is disposed
    panel.onDidDispose(() => {
      changeSubscription.dispose();
      currentPanel = null;
    });

    return panel;
  };

  // Listen for when the active text editor changes
  const activeEditorChangeSubscription = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (!editor || !isValidControllerFile(editor.document)) {
      return;
    }

    const config = vscode.workspace.getConfiguration("controllerView");
    if (!currentPanel) {
      // Only auto-create panel if autoOpen is true
      if (config.get("autoOpen") === true) {
        currentPanel = createPanel();
      } else {
        // autoOpen disabled, so do NOT create panel automatically
        return;
      }
    }

    // If panel exists, always update (regardless of autoOpen setting)
    currentPanel.webview.postMessage({
      type: "update",
      json: editor.document.getText(),
    });
  });

  // Register a command to manually open the custom editor
  context.subscriptions.push(
    vscode.commands.registerCommand("controller-view.openViewer", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Please open a JSON file.");
        return;
      }

      // Only operate on valid controller files
      if (!isValidControllerFile(editor.document)) {
        vscode.window.showErrorMessage("This is not a valid controller file.");
        return;
      }

      // If panel is already open, just update it
      if (currentPanel) {
        currentPanel.webview.postMessage({
          type: "update",
          json: editor.document.getText(),
        });
        return;
      }

      // Create new panel
      currentPanel = createPanel();
    })
  );
  // Register a command to toggle the auto-open setting
  context.subscriptions.push(
    vscode.commands.registerCommand("controller-view.toggleAutoOpen", async () => {
      const config = vscode.workspace.getConfiguration("controllerView");
      const current = config.get("autoOpen", true);

      // Toggle the boolean setting
      await config.update("autoOpen", !current, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(`Controller View Auto Open is now ${!current ? "enabled" : "disabled"}`);
    })
  );
  // Add the active editor change subscription to context
  context.subscriptions.push(activeEditorChangeSubscription);

  // Check if the currently active editor is a valid controller file on activation
  const activeEditor = vscode.window.activeTextEditor;
  const config = vscode.workspace.getConfiguration("controllerView");
  if (config.get("autoOpen") === true && activeEditor && isValidControllerFile(activeEditor.document)) {
    currentPanel = createPanel();
  }
}

// Helper function to return the HTML content for the webview
function getWebviewContent(webview, extensionPath) {
  const scriptPath = vscode.Uri.file(path.join(extensionPath, "media", "script.js"));
  const stylePath = vscode.Uri.file(path.join(extensionPath, "media", "style.css"));
  const resetStylePath = vscode.Uri.file(path.join(extensionPath, "media", "reset.css"));

  const scriptUri = webview.asWebviewUri(scriptPath);
  const styleUri = webview.asWebviewUri(stylePath);
  const resetStyleUri = webview.asWebviewUri(resetStylePath);

  const htmlPath = path.join(extensionPath, "media", "index.html");
  let htmlContent = fs.readFileSync(htmlPath, "utf8");
  htmlContent = htmlContent
    .replace(/{{styleUri}}/g, styleUri)
    .replace(/{{scriptUri}}/g, scriptUri)
    .replace(/{{resetStyleUri}}/g, resetStyleUri);
  return htmlContent;
}

// Export the activate function
module.exports = {
  activate,
  deactivate() {
    if (currentPanel) {
      currentPanel.dispose();
      currentPanel = null;
    }
  }
};
