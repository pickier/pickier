# Types

All types are exported from `pickier` and defined in `packages/pickier/src/types.ts`.

## CLI Options

```ts
export interface FormatOptions {
  write?: boolean
  check?: boolean
  config?: string
  ignorePath?: string
  ext?: string
  verbose?: boolean
}

export interface LintOptions {
  fix?: boolean
  dryRun?: boolean
  maxWarnings?: number
  reporter?: 'stylish' | 'json' | 'compact'
  config?: string
  ignorePath?: string
  ext?: string
  cache?: boolean
  verbose?: boolean
}
```

## Core Config Types

```ts
export type RuleSeverity = 'off' | 'warn' | 'error'

export type Extension =
  | 'ts' | 'js' | 'html' | 'css' | 'json' | 'jsonc' | 'md' | 'yaml' | 'yml' | 'stx'

export interface PickierRulesConfig {
  noDebugger: RuleSeverity
  noConsole: RuleSeverity
  noUnusedCapturingGroup?: RuleSeverity
  noCondAssign?: RuleSeverity
  noTemplateCurlyInString?: RuleSeverity
}

export interface PickierLintConfig {
  extensions: Extension[]
  reporter: 'stylish' | 'json' | 'compact'
  cache: boolean
  maxWarnings: number
}

export interface PickierFormatConfig {
  extensions: Extension[]
  trimTrailingWhitespace: boolean
  maxConsecutiveBlankLines: number
  finalNewline: 'one' | 'two' | 'none'
  indent: number
  indentStyle?: 'spaces' | 'tabs'
  quotes: 'single' | 'double'
  semi: boolean
}

export interface PickierConfig {
  verbose: boolean
  ignores: string[]
  lint: PickierLintConfig
  format: PickierFormatConfig
  rules: PickierRulesConfig
  plugins?: Array<PickierPlugin | string>
  pluginRules?: RulesConfigMap
}
```

## Plugin Authoring Types

```ts
export type RulesConfigMap = Record<string, RuleSeverity | [RuleSeverity, unknown]>

export interface RuleMeta { docs?: string, recommended?: boolean, wip?: boolean }

export interface RuleContext {
  filePath: string
  config: PickierConfig
  options?: unknown
}

export interface LintIssue {
  filePath: string
  line: number
  column: number
  ruleId: string
  message: string
  severity: 'warning' | 'error'
}

export interface RuleModule { meta?: RuleMeta, check: (content: string, context: RuleContext) => LintIssue[] }

export interface PickierPlugin { name: string, rules: Record<string, RuleModule> }
```
