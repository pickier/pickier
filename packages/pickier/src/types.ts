export type RuleSeverity = 'off' | 'warn' | 'error'

export interface PickierRulesConfig {
  // linter rules (subset for now)
  noDebugger: RuleSeverity
  noConsole: RuleSeverity
  // Style rules
  curly?: RuleSeverity
  // RegExp best practices
  noUnusedCapturingGroup?: RuleSeverity
  // Disallow assignments in conditional expressions
  noCondAssign?: RuleSeverity
  // Disallow template literal placeholder syntax in regular strings
  noTemplateCurlyInString?: RuleSeverity
}

export interface LintIssue {
  filePath: string
  line: number
  column: number
  ruleId: string
  message: string
  severity: 'warning' | 'error'
  help?: string
}

export type Extension = 'ts' | 'js' | 'html' | 'css' | 'json' | 'jsonc' | 'md' | 'yaml' | 'yml' | 'stx' | 'lock'

export interface PickierLintConfig {
  extensions: Extension[]
  reporter: 'stylish' | 'json' | 'compact'
  cache: boolean
  maxWarnings: number
}

export interface PickierFormatConfig {
  // file extensions to format
  extensions: Extension[]
  // trim trailing whitespace
  trimTrailingWhitespace: boolean
  // maximum number of consecutive blank lines to keep
  maxConsecutiveBlankLines: number
  // final newline policy: 'one' ensures 1; 'two' ensures a blank line + final newline; 'none' ensures no trailing newline
  finalNewline: 'one' | 'two' | 'none'
  // indentation size in spaces per level (when indentStyle is 'spaces') or the visual width of a tab level (when 'tabs')
  indent: number
  // indentation style for code files (ts/js/tsx/jsx)
  indentStyle?: 'spaces' | 'tabs'
  // preferred quote style for code files (ts/js/tsx/jsx). JSON is always kept as double quotes
  quotes: 'single' | 'double'
  // when true, remove stylistic semicolons at end of statements (for/for-in headers unaffected)
  semi: boolean
}

export interface PickierTailwindConfig {
  // Enable Tailwind class ordering rule (pickier/sort-tailwind-classes)
  enabled: boolean
  // Path to tailwind.config.js/ts relative to project root (for future use)
  configPath?: string
  // Additional utility function names to scan for class strings (e.g. ['myTw', 'styles'])
  callees?: string[]
  // Additional HTML attribute names to scan (e.g. ['wrapperClass', 'labelClass'])
  attributes?: string[]
}

export interface PickierConfig {
  verbose: boolean
  ignores: string[]
  lint: PickierLintConfig
  format: PickierFormatConfig
  rules: PickierRulesConfig
  // Tailwind CSS class ordering
  tailwind?: PickierTailwindConfig
  // Plugin system (optional)
  plugins?: Array<PickierPlugin | string>
  // Support both bare rule IDs (preferred) and legacy plugin-prefixed IDs
  pluginRules?: RulesConfigMap
}

export type PickierOptions = Partial<PickierConfig>

// Plugin system types
export type RulesConfigMap = Record<string, RuleSeverity | [RuleSeverity, unknown]>

export interface RuleMeta {
  docs?: string
  recommended?: boolean
  wip?: boolean
}

export interface RuleContext {
  filePath: string
  config: PickierConfig
  options?: unknown
}

export interface RuleModule {
  meta?: RuleMeta
  check: (content: string, context: RuleContext) => LintIssue[]
  // Optional fixer to automatically transform content.
  // If provided and the rule is enabled (not 'off'), the engine may call it when --fix is used.
  // The fixer should be idempotent and safe to run multiple times.
  fix?: (content: string, context: RuleContext) => string
}

export interface PickierPlugin {
  name: string
  rules: Record<string, RuleModule>
}

// CLI option types (centralized)
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
  /** @internal Fast path: skip scanning/plugin checks, only apply fixers */
  _formatOnly?: boolean
}

export interface FormatOptions {
  write?: boolean
  check?: boolean
  config?: string
  ignorePath?: string
  ext?: string
  verbose?: boolean
}
