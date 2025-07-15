# Animation Controller Graph Viewer

A Visual Studio Code extension that provides a visual graph viewer for Minecraft Bedrock Edition animation controller files. This extension helps developers visualize the state machine structure of their animation controllers with an interactive graph display.

## Features

- **Automatic Detection**: Automatically recognizes valid Minecraft Bedrock animation controller JSON files
- **Visual Graph Display**: View your animation controller states and transitions in an interactive graph
- **Auto-Open**: Automatically opens the graph viewer when you open a valid controller file (configurable)
- **Real-time Updates**: The graph updates automatically as you edit your controller file
- **Side-by-Side View**: Opens in a separate panel beside your code editor
- **Manual Control**: Toggle auto-open behavior or manually open the viewer via commands

## Supported Files

The extension automatically detects JSON files that contain:
- `animation_controllers` object with at least one controller definition
- Valid Minecraft Bedrock animation controller structure

## Usage

### Automatic Mode (Default)
1. Open a Minecraft Bedrock animation controller JSON file
2. The graph viewer will automatically open in a side panel
3. Edit your controller file and watch the graph update in real-time

### Manual Mode
1. Use `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac) to open the command palette
2. Search for "Open Animation Controller Graph" and select it
3. Or use "Toggle Auto Open" to disable/enable automatic opening

## Commands

- **Controller View: Open Animation Controller Graph** - Manually open the graph viewer for the current file
- **Controller View: Toggle Auto Open** - Toggle the auto-open setting globally

## Configuration

Access these settings via VS Code's settings (`Ctrl+,`):

- `controllerView.autoOpen` (boolean, default: `true`) - Automatically open the controller graph when opening a valid controller file

## Requirements

- Visual Studio Code 1.60.0 or higher
- Valid Minecraft Bedrock animation controller JSON files

## File Structure

The extension looks for JSON files with the following structure:
```json
{
  "animation_controllers": {
    "controller.animation.example": {
      "states": {
        "default": {
          // state definition
        }
      }
    }
  }
}
```

## Installation

1. Install from the VS Code Marketplace
2. Search for "Animation Controller Graph Viewer" by Pixelmancer
3. Or download the VSIX file and install manually

## Contributing

This is an open-source project. Contributions are welcome!

## License

MIT License - see LICENSE.md for details

## Version History

### 1.0.1
- Current release with improved stability and performance

### 1.0.0
- Initial release with core functionality
