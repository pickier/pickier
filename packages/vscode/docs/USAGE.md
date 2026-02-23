# Pickier VS Code Extension Usage Guide

The Pickier VS Code extension provides fast formatting and linting capabilities for TypeScript, JavaScript, JSON, HTML, CSS, Markdown, and YAML files.

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "Pickier"
4. Click Install

## Features

### Formatting

-**Format Document**: Format the entire active document
-**Format Selection**: Format only the selected text
-**Format on Save**: Automatically format files when saved (configurable)

### Linting

-**Lint Document**: Check the current document for issues
-**Lint Workspace**: Check all files in the workspace
-**Lint on Save**: Automatically lint files when saved (enabled by default)

### Real-time Feedback

-**Status Bar Integration**: Shows Pickier status in the status bar
-**Diagnostic Integration**: Displays lint issues inline with squiggly underlines
-**Output Channel**: Detailed logging of operations and errors

## Commands

Access these commands via the Command Palette (Ctrl+Shift+P / Cmd+Shift+P):

- `Pickier: Format Document`- Format the current document

-`Pickier: Format Selection`- Format the selected text
-`Pickier: Lint Document`- Lint the current document
-`Pickier: Lint Workspace`- Lint all files in the workspace

## Configuration

Configure Pickier through VS Code settings. Go to File > Preferences > Settings and search for "Pickier":

### Available Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
|`pickier.enable`| boolean |`true`| Enable/disable the Pickier extension |
|`pickier.configPath`| string |`""`| Path to Pickier config file (relative to workspace root) |
|`pickier.formatOnSave`| boolean |`false`| Format files automatically on save |
|`pickier.lintOnSave`| boolean |`true`| Lint files automatically on save |
|`pickier.showOutputChannel`| boolean |`false`| Show Pickier output channel for debugging |

### Example Settings (settings.json)```json

{
  "pickier.enable": true,
  "pickier.formatOnSave": true,
  "pickier.lintOnSave": true,
  "pickier.configPath": "pickier.config.ts",
  "pickier.showOutputChannel": false
}

```## Pickier Configuration File

Create a`pickier.config.ts`file in your workspace root to customize Pickier behavior:```typescript
import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  verbose: false,
  ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  lint: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml'],
    reporter: 'stylish',
    cache: false,
    maxWarnings: -1,
  },
  format: {
    extensions: ['ts', 'js', 'html', 'css', 'json', 'jsonc', 'md', 'yaml', 'yml'],
    trimTrailingWhitespace: true,
    maxConsecutiveBlankLines: 1,
    finalNewline: 'one',
    indent: 2,
    indentStyle: 'spaces',
    quotes: 'single',
    semi: false,
  },
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
    noUnusedCapturingGroup: 'error',
    noCondAssign: 'error',
    noTemplateCurlyInString: 'warn',
  },
}

export default config
```## Supported File Types

Pickier supports the following file extensions:

-**TypeScript**:`.ts`, `.tsx`-**JavaScript**:`.js`, `.jsx`-**JSON**:`.json`-**JSON with Comments**:`.jsonc`-**HTML**:`.html`-**CSS**:`.css`-**Markdown**:`.md`-**YAML**:`.yaml`, `.yml`## Integration with Other Extensions

### Disable Conflicting Formatters

To avoid conflicts with other formatting extensions, you may want to disable them for file types that Pickier handles:

```json
{
  "[typescript]": {
    "editor.defaultFormatter": "pickier.vscode"
  },
  "[javascript]": {
    "editor.defaultFormatter": "pickier.vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "pickier.vscode"
  }
}
```

### Working with ESLint/Prettier

Pickier can work alongside ESLint and Prettier, but you may want to configure them to avoid overlapping rules:

1. Disable formatting rules in ESLint
2. Use Pickier for formatting and ESLint for logical linting
3. Configure Prettier to exclude files that Pickier handles

## Keyboard Shortcuts

You can assign custom keyboard shortcuts to Pickier commands:

1. Go to File > Preferences > Keyboard Shortcuts
2. Search for "Pickier"
3. Assign shortcuts to the commands you use most

Example keybindings.json:```json
[
  {
    "key": "ctrl+shift+f",
    "command": "pickier.format",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+shift+l",
    "command": "pickier.lint",
    "when": "editorTextFocus"
  }
]

```## Troubleshooting

### Common Issues

1.**Extension not activating**: Ensure you're working with supported file types
2.**Formatting not working**: Check that Pickier is enabled in settings
3.**Linting issues not showing**: Verify`pickier.lintOnSave`is enabled
4.**Performance issues**: Try enabling`pickier.showOutputChannel`to debug

### Debug Mode

Enable the output channel to see detailed logs:

1. Set`pickier.showOutputChannel`to`true`2. Open View > Output
3. Select "Pickier" from the dropdown
4. Perform actions to see debug information

### Configuration Issues

If your configuration file isn't being loaded:

1. Ensure it's in the workspace root
2. Check the file name matches`pickier.configPath` setting
3. Verify the configuration syntax is correct
4. Check the output channel for error messages

## Performance

Pickier is designed to be fast:

-**Native Speed**: Built with Bun for maximum performance
-**Minimal Dependencies**: Lightweight architecture
-**Incremental Processing**: Only processes changed files
-**Efficient Caching**: Reuses results when possible

## Contributing

Found a bug or have a feature request? Please check our [GitHub repository](https://github.com/pickier/pickier) and open an issue or pull request.

## License

MIT License - see the [LICENSE](../LICENSE.md) file for details.
