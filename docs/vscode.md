# VS Code Extension

The Pickier VS Code extension brings real-time linting, formatting, and intelligent code actions directly into your editor. Think of it as your personal code quality assistant that watches as you type and helps you write better code.

## What Makes It Special

### Rich Hover Information

When you hover over any issue in your code, Pickier shows you exactly what's wrong and how to fix it. You'll see the rule that was violated, whether it's an error or warning, and most importantly detailed help text that explains the problem in plain English. If the issue can be fixed automatically, you'll see a sparkle ✨ icon letting you know you can fix it with one click.

This means you don't need to constantly look up documentation or remember what each rule does. The information comes to you right where you need it.

### CodeLens Annotations

At the top of each file, you'll see a summary showing how many errors and warnings exist, and crucially, how many can be auto-fixed. This gives you an instant overview of your file's health without having to scroll through all the issues. Even better, there's a "Fix all" button right there that lets you clean up all the auto-fixable issues in one go.

When you're working on improving code quality, these annotations become incredibly useful. They show your progress as issues get resolved and help you prioritize what to tackle next.

### Smart Code Actions

Placing your cursor on any issue and pressing `Cmd+.`(or`Ctrl+.`on Windows/Linux) opens a menu of actions you can take. For issues that can be fixed automatically, you'll see a Fix option that corrects the problem instantly. You can also choose to disable the rule either for just that line or for the entire file, and there's always a link to view the full documentation if you want to understand the rule better.

This contextual menu adapts to each issue, showing you only the relevant actions. It's designed to keep you in flow without breaking your concentration.

### Problems Panel Integration

All the issues Pickier finds show up in VS Code's Problems panel, which you can open with`Cmd+Shift+M`. They're organized by severity so you can tackle errors before warnings. Clicking any issue takes you straight to that line in your code. The panel also shows the full help text for each issue, making it easy to understand and fix problems even when you're not hovering over them.

### Auto-fix on Save

If you enable the format-on-save option, Pickier will automatically fix all the issues it can every time you save a file. This is perfect for maintaining code quality without thinking about it. Your debugger statements disappear, your quotes become consistent, and your code stays clean automatically.

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Press `Cmd+Shift+X`to open Extensions
3. Search for "Pickier"
4. Click Install

### From VSIX```bash

code --install-extension pickier-vscode-*.vsix

```## Quick Start

1. Install the extension
2. Open a TypeScript/JavaScript project
3. Open any`.ts`or`.js`file
4. Issues will appear automatically with red/yellow underlines

## Configuration

### Extension Settings

Configure the extension in VS Code settings (Cmd+,):```json
{
  // Enable/disable the extension
  "pickier.enable": true,

  // Lint files as you type (with 500ms debounce)
  "pickier.lintOnChange": true,

  // Lint files when you save
  "pickier.lintOnSave": true,

  // Format files when you save
  "pickier.formatOnSave": false,

  // Format pasted code automatically
  "pickier.formatOnPaste": false,

  // Show CodeLens annotations
  "pickier.codeLens.enable": true,

  // Show issue count in status bar
  "pickier.statusBar.showIssueCount": true,

  // Enable code actions (quick fixes)
  "pickier.codeActions.enable": true,

  // Path to custom config file (relative to workspace)
  "pickier.configPath": "",

  // Show Pickier output channel
  "pickier.showOutputChannel": false
}
```### Pickier Configuration

Create`pickier.config.ts`in your project root:```ts
import type { PickierConfig } from 'pickier'

export default {
  // Lint configuration
  lint: {
    extensions: ['ts', 'tsx', 'js', 'jsx', 'vue'],
  },

  // Format configuration
  format: {
    quotes: 'single',
    indent: 2,
    indentStyle: 'spaces',
  },

  // Built-in rules
  rules: {
    noDebugger: 'error',
    noConsole: 'warn',
    noTemplateCurlyInString: 'error',
    noCondAssign: 'error',
  },

  // Plugin rules
  pluginRules: {
    'pickier/no-unused-vars': 'error',
    'pickier/prefer-const': 'error',
    'pickier/prefer-template': 'warn',

    // Sort rules (disabled by default)
    'pickier/sort-imports': 'off',
    'pickier/sort-named-imports': 'off',
  },

  // Ignore patterns
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
  ],
} satisfies PickierConfig

```## Usage

### Viewing Issues

Issues appear in three places:

1.**Inline**- Red/yellow underlines in the editor
2.**CodeLens**- Stats at the top of each file
3.**Problems Panel**- Cmd+Shift+M to see all issues

### Fixing Issues**Auto-fix a single issue:**1. Place cursor on the issue

2. Press`Cmd+.`(Quick Fix)
3. Select "Fix: [description]"**Fix all issues in file:**1. Click "Fix all" in CodeLens, or
2. Press`Cmd+Shift+P`3. Run "Pickier: Fix All Auto-fixable Issues"**Format entire file:**- Press`Shift+Alt+F`(default format shortcut), or
- Press`Cmd+Shift+P`and run "Pickier: Format Document"

### Disabling Rules**Disable for one line:**1. Place cursor on the issue

2. Press`Cmd+.`3. Select "Disable [rule] for this line"

This adds:```ts
// pickier-disable-next-line rule-name
```**Disable for entire file:**1. Press `Cmd+.`on any issue

2. Select "Disable [rule] for entire file"

This adds at top of file:```ts
/*pickier-disable rule-name*/

```**Disable in config:**```ts
// pickier.config.ts
export default {
  rules: {
    noConsole: 'off',  // Disable built-in rule
  },
  pluginRules: {
    'pickier/sort-imports': 'off',  // Disable plugin rule
  },
}
```### Organizing Imports**Automatically:**- Click "📦 Organize Imports" in CodeLens (when available), or

- Press`Cmd+Shift+P` and run "Pickier: Organize Imports"**Enable in config:**```ts

// pickier.config.ts
export default {
  pluginRules: {
    'pickier/sort-imports': 'error',
    'pickier/sort-named-imports': 'error',
  },
}

```## Commands

Access via Command Palette (Cmd+Shift+P):

| Command | Description |
|---------|-------------|
|`Pickier: Format Document`| Format the active file |
|`Pickier: Format Selection`| Format selected text |
|`Pickier: Lint Document`| Run linter on active file |
|`Pickier: Lint Workspace`| Run linter on entire workspace |
|`Pickier: Organize Imports`| Sort and organize imports |
|`Pickier: Fix All Auto-fixable Issues`| Fix all auto-fixable issues in file |
|`Pickier: Show Output Channel`| Show Pickier output logs |
|`Pickier: Restart Extension` | Restart the extension |

## Supported Languages

- TypeScript (`.ts`, `.tsx`)
- JavaScript (`.js`, `.jsx`)
- JSON (`.json`, `.jsonc`)
- Vue (`.vue`)
- Markdown (`.md`)
- HTML (`.html`)
- CSS (`.css`)
- YAML (`.yaml`, `.yml`)

## Examples

### Example 1: Viewing Hover Help

```ts

// Hover over 'debugger' to see:
// 🔴 no-debugger
// Unexpected debugger statement
//
// 💡 How to fix:
// Remove debugger statements before committing code.
// Use breakpoints in your IDE instead, or run with
// --fix to auto-remove
//
// ✨ Auto-fix available

```### Example 2: Using Code Actions```ts
function test() {
  const unused = 'value'  // Place cursor here, press Cmd+.
  return 42
}

// Available actions:
// - Disable no-unused-vars for this line
// - Disable no-unused-vars for entire file
// - View documentation
```### Example 3: Fix All```ts

// Before (5 errors, 2 warnings, 3 auto-fixable)
function test() {
  let x = 10  // auto-fixable (prefer-const)
  const msg = 'Hello' + ' World'  // auto-fixable (prefer-template)
  const unused = 'value'  // NOT auto-fixable
  console.log(x)  // NOT auto-fixable
  return msg
}

// Click "Fix all 3 auto-fixable issues" in CodeLens

// After (2 warnings, 0 auto-fixable)
function test() {
  const x = 10  // fixed
  const msg = `Hello World`// fixed
  const unused = 'value'  // remains
  console.log(x)  // remains
  return msg
}```

## Troubleshooting

### Extension Not Working

1.**Check extension is enabled**

   ```json
   { "pickier.enable": true }
   ```

2.**Verify file is supported**- Only`.ts`, `.tsx`, `.js`, `.jsx`, etc. are supported

- Check `pickier.config.ts`extensions list

3.**Reload window**- Press`Cmd+Shift+P`

- Run "Developer: Reload Window"

### No Issues Showing

1.**Save the file**- Linting may only run on save
2.**Check config**- Ensure rules are enabled
3.**View Output Channel**- Run "Pickier: Show Output Channel"

- Look for errors

### CodeLens Not Appearing

1.**Check setting**```json
   { "pickier.codeLens.enable": true }

   ```

2.**Reload window**- CodeLens may need window reload after config change

### Performance Issues

1.**Disable lint on change**

   ```json
   { "pickier.lintOnChange": false }
   ```

2.**Reduce file scope**in`pickier.config.ts`

   ```ts
   {
     ignores: ['**/large-folder/**']
   }
   ```

3.**Disable expensive rules**

   ```ts
   {
     pluginRules: {
       'regexp/no-super-linear-backtracking': 'off'
     }
   }
   ```

## Advanced

### Custom Configuration Path

Point to a custom config file:```json
{
  "pickier.configPath": "configs/pickier.staging.ts"
}

```### Workspace vs User Settings

-**User settings**- Apply to all projects
-**Workspace settings**- Apply only to current project

Workspace settings override user settings.

### Multi-root Workspaces

Each workspace folder can have its own`pickier.config.ts`.

### Integration with Other Extensions**Disable conflicting formatters:**```json

{
  "editor.defaultFormatter": "pickier.pickier-vscode",
  "prettier.enable": false,
  "eslint.format.enable": false
}
```

**Format on save:**

```json

{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "pickier.pickier-vscode"
}

```

### Pre-commit Hooks

```bash

# .husky/pre-commit

npx pickier run . --mode lint --fix
```

## FAQ

### Q: How is this different from ESLint extension

Pickier is faster and includes formatting, sorting, and linting in one tool. It's built with Bun for maximum performance.

### Q: Can I use both Pickier and ESLint

Yes, but disable overlapping rules to avoid conflicts. Use ESLint for logical rules and Pickier for formatting/sorting.

### Q: Why aren't issues showing in comments

This is intentional. Pickier v0.2+ skips linting inside comments to avoid false positives.

### Q: How do I disable a rule temporarily

Use`// pickier-disable-next-line rule-name`or press Cmd+. and select "Disable for this line". The`eslint-disable-next-line` prefix also works for compatibility.

### Q: Can I customize the base documentation URL

Yes, configure in workspace settings (feature added in v0.2+).

## Related

- [Rules Reference](./rules/index.md)
- [Configuration Guide](./config.md)
- [CLI Reference](./cli.md)
- [Advanced Configuration](./advanced/configuration.md)
