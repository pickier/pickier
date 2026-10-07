# API Reference

Public exports from `pickier`:

- `runFormat(globs: string[], options: FormatOptions): Promise<number>`
- `runLint(globs: string[], options: LintOptions): Promise<number>`
- `defaultConfig`: static defaults
- `config`: runtime-loaded config via `bunfig`
- All core types (see `Types`): `PickierConfig`, `PickierFormatConfig`, `PickierLintConfig`, `PickierRulesConfig`, `Extension`, `RuleSeverity`
- Plugin authoring types: `PickierPlugin`, `RuleModule`, `RuleContext`, `RulesConfigMap`

See also:

- Functions, Types, and Defaults pages for details
