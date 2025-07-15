# Animation Controller Graph Viewer

A Visual Studio Code extension that provides a visual graph viewer for Minecraft Bedrock Edition animation controller files.

## Features

- **Visual Graph Display**: View your animation controller states and transitions in an interactive graph
- **Auto-Open**: Automatically opens the graph viewer when you open a valid controller file
- **Real-time Updates**: The graph updates automatically as you edit your controller file
- **Manual Control**: Toggle auto-open behavior or manually open the viewer

## Usage

1. Open a Minecraft Bedrock animation controller JSON file
2. The graph viewer will automatically open (if auto-open is enabled)
3. Or use the command palette (`Ctrl+Shift+P`) and search for "Open Animation Controller Graph"

## Commands

- `Controller View: Open Animation Controller Graph` - Manually open the graph viewer
- `Controller View: Toggle Auto Open` - Toggle the auto-open setting

## Configuration

- `controllerView.autoOpen` - Automatically open the controller graph when opening a valid controller file (default: true)

## Requirements

- Visual Studio Code 1.60.0 or higher
- Valid Minecraft Bedrock animation controller JSON files

## Installation

Install from the VS Code Marketplace or download the VSIX file.

## License

MIT
