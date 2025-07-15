const vscode = require("vscode");
const path = require("path");
const fs = require("fs");

function activate(context) {
  // Register a command to open the custom editor
  context.subscriptions.push(
    vscode.commands.registerCommand("controller-view.openViewer", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("Please open a JSON file.");
        return;
      }

      // Only operate on JSON files
      const filePath = editor.document.uri.fsPath;
      if (!filePath.endsWith(".json")) {
        vscode.window.showErrorMessage("This is not a JSON file.");
        return;
      }

      // Create and show the webview panel
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
        panel.webview.postMessage({
          type: "update",
          json: newEditor.document.getText(), // Send the document text as JSON
        });
      };

      // Subscribe to changes in the document
      const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document) {
          updateWebview(); // Resend the updated content to the webview
        }
      });

      // Listen for when the active text editor changes
      const activeEditorChangeSubscription = vscode.window.onDidChangeActiveTextEditor((newEditor) => {
        if (newEditor) {
          // Update the panel with the new document's content
          updateWebview();
        }
      });

      // Update the webview with the initial content
      updateWebview();

      // Clean up when the webview is disposed
      panel.onDidDispose(() => {
        changeSubscription.dispose();
        activeEditorChangeSubscription.dispose();
      });
    })
  );
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
};
