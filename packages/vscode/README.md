# Pickier VS Code Extension

Fast, modern formatter and linter for TypeScript, JavaScript, JSON, HTML, CSS, Markdown, and YAML.

## Features

-**Lightning Fast**: Built on Bun runtime for incredible performance
-**Real-time Linting**: See errors and warnings as you type
-**Auto-fix**: Automatically fix many issues with one command
-**Multiple Languages**: TypeScript, JavaScript, JSON, HTML, CSS, Markdown, YAML
-**Markdown Linting**: Comprehensive MD001-MD059 rule coverage
-**Problems Integration**: All issues appear in VS Code's Problems panel
-**Smart Underlines**: Visual indicators for errors (red) and warnings (yellow)
-**Hover Tooltips**: Detailed error/warning information on hover
-**Status Bar**: See issue count at a glance

## Usage

### Automatic Linting

The extension automatically lints files when you:

- Open a file
- Save a file (configurable)
- Type (with 500ms debounce, configurable)

### Commands

Access commands via Command Palette (Cmd/Ctrl+Shift+P):

- `Pickier: Format Document`- Format the current file

-`Pickier: Format Selection`- Format selected text
-`Pickier: Lint Document`- Lint the current file
-`Pickier: Lint Workspace`- Lint all files in workspace
-`Pickier: Fix All Auto-fixable Issues`- Apply all available fixes
-`Pickier: Organize Imports`- Sort and organize imports
-`Pickier: Show Output Channel`- Show detailed output
-`Pickier: Restart Extension`- Restart the extension

### Configuration

Configure Pickier in VS Code settings:

```json
{
  "pickier.enable": true,
  "pickier.lintOnSave": true,
  "pickier.lintOnChange": true,
  "pickier.formatOnSave": false,
  "pickier.formatOnPaste": false,
  "pickier.statusBar.showIssueCount": true
}

```

### Visual Indicators

-**Red Squiggles**: Errors that must be fixed
-**Yellow Squiggles**: Warnings and style suggestions
-**Faded Text**: Unused variables/imports
-**Strikethrough**: Deprecated code

## Requirements

- VS Code 1.74.0 or higher
- Pickier installed in your project (`bun add -d pickier`)

## Configuration File

Create a `pickier.config.ts`in your project root:```typescript
import type { PickierConfig } from 'pickier'

export default {
  lint: {
    extensions: ['ts', 'js', 'md'],
    reporter: 'stylish'
  },
  format: {
    indent: 2,
    quotes: 'single',
    semi: false
  }
} satisfies PickierConfig

```

## Supported Languages

- TypeScript (.ts, .tsx)
- JavaScript (.js, .jsx)
- JSON (.json, .jsonc)
- HTML (.html)
- CSS (.css)
- Markdown (.md)
- YAML (.yaml, .yml)

## Issues & Feedback

Report issues at: <https://github.com/pickier/pickier/issues>

## License

MIT License - see LICENSE file for details
