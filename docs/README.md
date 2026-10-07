# Pickier Documentation

Welcome to the comprehensive Pickier documentation. This guide will help you get the most out of Pickier, whether you're just getting started or configuring advanced setups for your team.

## Quick Links

- **[Installation →](./install.md)** - Get Pickier up and running
- **[Usage Guide →](./usage.md)** - Basic usage and workflows
- **[Rules Reference →](./rules/index.md)** - Complete list of all linting rules
- **[Configuration →](./config.md)** - How to configure Pickier for your project
- **[CLI Reference →](./cli.md)** - Command-line interface documentation
- **[VS Code Extension →](./vscode.md)** - Editor integration guide

## What is Pickier?

Pickier is a fast, all-in-one code quality tool built with Bun. It combines linting, formatting, and code organization into a single tool that runs significantly faster than traditional alternatives. Instead of juggling ESLint, Prettier, and various plugins, Pickier gives you everything you need in one package.

## Getting Started

The fastest way to start using Pickier is through the CLI:

```bash
bun add -D pickier
bunx pickier run . --mode lint
```

For real-time feedback while coding, install the VS Code extension from the marketplace. It provides hover information, code actions, and automatic fixes right in your editor.

## Core Features

### Lightning Fast Performance

Pickier is built with Bun from the ground up, making it orders of magnitude faster than traditional Node.js-based tools. Large codebases that took minutes to lint now take seconds.

### Unified Tooling

Instead of maintaining separate configurations for ESLint, Prettier, and various sorting plugins, Pickier provides everything through a single configuration file. This means less setup, fewer dependencies, and no more conflicts between tools.

### Smart Auto-fixing

Most issues Pickier finds can be fixed automatically. Run with the `--fix` flag and watch debugger statements disappear, quotes become consistent, and imports get sorted. The auto-fixing is intelligent enough to preserve your code's behavior while improving its style.

### Rich Editor Integration

The VS Code extension goes beyond simple error highlighting. Hover over any issue to see detailed help text explaining what's wrong and how to fix it. CodeLens annotations show file-level statistics and provide quick-fix buttons. Code actions let you disable rules or view documentation without leaving your editor.

## Documentation Structure

### For Beginners

Start with these guides to learn the basics:

1. [Installation](./install.md) - Install Pickier in your project
2. [Usage Guide](./usage.md) - Learn basic commands and workflows
3. [Configuration](./config.md) - Create your first config file
4. [VS Code Extension](./vscode.md) - Set up editor integration

### For Advanced Users

Once you're comfortable with the basics, explore these advanced topics:

- [Advanced Configuration](./advanced/configuration.md) - Team configs, monorepos, CI/CD
- [Rules Reference](./rules/index.md) - Deep dive into every available rule
- [API Reference](./api/) - Use Pickier programmatically

### Reference Material

Quick lookups and detailed specifications:

- [CLI Reference](./cli.md) - All command-line options and flags
- [Rules Index](./rules/index.md) - Complete rule catalog with examples
- [Configuration Schema](./config.md) - All configuration options explained

## Common Use Cases

### Individual Developer

You want to write cleaner code and catch mistakes early. Install Pickier and the VS Code extension, then let it guide you as you code. Enable auto-fix on save to keep your code clean automatically.

### Team Lead

You need consistency across your team's codebase. Create a shared Pickier configuration, add it to your repository, and set up git hooks to enforce standards before code is committed. The extension ensures everyone sees the same issues in their editor.

### Large Organization

You're managing multiple projects with different needs. Create base configurations that all projects share, then let individual teams extend them for their specific requirements. Run Pickier in CI to enforce quality gates and prevent regressions.

## Key Concepts

### Rules and Severity

Every rule in Pickier can be set to three levels:
- `'error'` - Fails builds and prevents commits
- `'warn'` - Shows warnings but doesn't fail
- `'off'` - Completely disabled

Choose the level that matches the importance of each rule to your project.

### Auto-fix vs Manual

Rules are marked as either auto-fixable (can be corrected automatically) or manual (require human judgment). The sparkle ✨ icon in the extension indicates auto-fixable rules. Use `--fix` to apply all auto-fixes at once.

### Disable Comments

Sometimes you need to break a rule temporarily. Use disable comments to suppress specific rules:
- `// pickier-disable-next-line rule-name` - Disables for one line
- `/* pickier-disable rule-name */` - Disables until re-enabled
- Both `pickier` and `eslint` prefixes work identically for compatibility

### Plugin Architecture

Pickier's rules are organized into plugins for better organization and discoverability:

- **Core** - Built-in rules always available (quotes, indent, debugger, console)
- **ESLint** (`eslint/`) - Legacy compatibility layer for ESLint rule names
- **General** (`general/`) - Error detection and possible problems (no-undef, no-const-assign, array-callback-return, etc.)
- **Quality** (`quality/`) - Best practices and code quality (eqeqeq, no-eval, no-var, prefer-arrow-callback, etc.)
- **Pickier** (`pickier/`) - Sorting and import organization (sort-imports, sort-objects, import-dedupe, etc.)
- **Style** (`style/`) - Code style enforcement (brace-style, curly, max-statements-per-line, etc.)
- **TypeScript** (`ts/`) - TypeScript-specific rules (no-explicit-any, prefer-optional-chain, no-floating-promises, etc.)
- **RegExp** (`regexp/`) - Regular expression safety (no-super-linear-backtracking, no-unused-capturing-group, etc.)
- **Markdown** (`markdown/`) - Markdown documentation linting with 53+ rules

Each plugin can be configured independently through the `pluginRules` configuration, giving you fine-grained control over your linting experience.

## Best Practices

### Start Small

Don't try to enable every rule at once. Start with the defaults, then gradually add rules as your team gets comfortable. This prevents overwhelming developers with hundreds of violations.

### Use Warnings First

When introducing new rules, start them at `'warn'` level. Once the codebase is clean, promote them to `'error'`. This gives your team time to adapt without blocking their work.

### Automate Everything

Set up pre-commit hooks to run Pickier automatically. Enable auto-fix on save in your editor. The less developers have to think about code quality, the more consistent it becomes.

### Document Your Decisions

Add comments to your configuration explaining why certain rules are enabled or disabled. This helps future maintainers understand the reasoning and prevents cargo-culting.

## Getting Help

### Documentation

Most questions are answered somewhere in these docs. Use the navigation menu to find relevant sections, or check the rules reference for specific rule behavior.

### Examples

The VS Code extension includes example files demonstrating every feature. Open the examples folder to see real code showing how features work.

### Community

Found a bug or have a feature request? Visit the [GitHub repository](https://github.com/pickier/pickier) to file an issue or contribute.

## What's Next?

Ready to dive deeper? Here are some suggested next steps:

- **Just installed?** → Read the [Usage Guide](./usage.md)
- **Setting up a config?** → Check the [Configuration Guide](./config.md)
- **Need a specific rule?** → Browse the [Rules Reference](./rules/index.md)
- **Working in a team?** → Read [Advanced Configuration](./advanced/configuration.md)
- **Using VS Code?** → Install the [VS Code Extension](./vscode.md)

Happy linting! 🚀
