# Rules Overview

Pickier provides a comprehensive set of linting rules organized into plugins. Core rules are configured under `rules`. Plugin rules are configured under `pluginRules`.

## Rule Organization

Rules are organized into the following plugins:

### Core Rules

Built-in rules that are always available and configured under `rules`:

- [`noDebugger`](/rules/no-debugger) - Disallow debugger statements
- [`noConsole`](/rules/no-console) - Disallow console statements
- [`noCondAssign`](/rules/no-cond-assign) - Disallow assignment in conditional expressions
- [`noTemplateCurlyInString`](/rules/no-template-curly-in-string) - Disallow template literal placeholder syntax in regular strings

### Plugin Rules

Plugin rules are configured under `pluginRules` and organized by category:

#### ESLint Plugin (`eslint/`)

Legacy compatibility layer for ESLint rule names. These rules duplicate the `general/` and `quality/` plugins for backward compatibility. It's recommended to use the `general/` or `quality/` prefixes for new configurations.

#### General Plugin (`general/`)

Error detection and possible problems (35 rules). See [general plugin documentation](/rules/general).

**Variable & Scope:**

- [`no-const-assign`](/rules/general#variable-scope) - Disallow reassigning const variables
- [`no-redeclare`](/rules/general#variable-scope) - Disallow variable redeclaration
- [`no-undef`](/rules/general#variable-scope) - Disallow undeclared variables
- [`no-unused-vars`](/rules/no-unused-vars) - Disallow unused variables
- [`no-shadow`](/rules/general#variable-scope) - Disallow variable declarations from shadowing outer scope
- [`no-use-before-define`](/rules/general#variable-scope) - Disallow use of variables before they are defined

**Functions & Callbacks:**

- [`array-callback-return`](/rules/general#functions-callbacks) - Enforce return statements in array callbacks
- [`getter-return`](/rules/general#functions-callbacks) - Enforce return statements in getters
- [`constructor-super`](/rules/general#functions-callbacks) - Require super() calls in constructors
- [`no-constructor-return`](/rules/general#functions-callbacks) - Disallow returning value from constructor

**Control Flow:**

- [`for-direction`](/rules/general#control-flow) - Enforce "for" loop update clause moving counter in the right direction
- [`no-fallthrough`](/rules/general#control-flow) - Disallow fallthrough of case statements
- [`no-unreachable`](/rules/general#control-flow) - Disallow unreachable code after return, throw, continue, and break
- [`no-constant-condition`](/rules/general#control-flow) - Disallow constant expressions in conditions

**Objects & Classes:**

- [`no-dupe-keys`](/rules/general#objects-classes) - Disallow duplicate keys in object literals
- [`no-dupe-class-members`](/rules/general#objects-classes) - Disallow duplicate class members
- [`no-duplicate-case`](/rules/general#objects-classes) - Disallow duplicate case labels

**Async & Promises:**

- [`no-async-promise-executor`](/rules/general#async-promises) - Disallow async promise executor
- [`no-promise-executor-return`](/rules/general#async-promises) - Disallow returning values from Promise executor

**Comparisons:**

- [`no-compare-neg-zero`](/rules/general#comparisons) - Disallow comparing against -0
- [`no-self-assign`](/rules/general#comparisons) - Disallow assignments where both sides are exactly the same
- [`no-self-compare`](/rules/general#comparisons) - Disallow comparisons where both sides are exactly the same
- [`use-isnan`](/rules/general#comparisons) - Require calls to isNaN() when checking for NaN
- [`valid-typeof`](/rules/general#comparisons) - Enforce comparing typeof expressions against valid strings

**Patterns & Syntax:**

- [`no-empty-pattern`](/rules/general#patterns-syntax) - Disallow empty destructuring patterns
- [`no-sparse-arrays`](/rules/general#patterns-syntax) - Disallow sparse arrays
- [`no-irregular-whitespace`](/rules/general#patterns-syntax) - Disallow irregular whitespace
- [`no-loss-of-precision`](/rules/general#patterns-syntax) - Disallow number literals that lose precision
- [`no-unsafe-negation`](/rules/general#patterns-syntax) - Disallow negating the left operand of relational operators
- [`no-useless-catch`](/rules/general#patterns-syntax) - Disallow unnecessary catch clauses

**Modern JavaScript:**

- [`prefer-const`](/rules/prefer-const) - Require const declarations for variables that are never reassigned
- [`prefer-object-spread`](/rules/general#modern-javascript) - Prefer object spread over Object.assign
- [`prefer-template`](/rules/general#modern-javascript) - Require template literals instead of string concatenation

#### Quality Plugin (`quality/`)

Best practices and code quality (40 rules). See [quality plugin documentation](/rules/quality).

**Equality & Comparisons:**

- [`eqeqeq`](/rules/quality#equality-comparisons) - Require === and !==
- [`default-case`](/rules/quality#equality-comparisons) - Require default cases in switch statements

**Functions:**

- [`no-empty-function`](/rules/quality#functions) - Disallow empty functions
- [`no-param-reassign`](/rules/quality#functions) - Disallow reassignment of function parameters
- [`no-useless-call`](/rules/quality#functions) - Disallow unnecessary .call() and .apply()
- [`require-await`](/rules/quality#functions) - Disallow async functions which have no await expression
- [`prefer-arrow-callback`](/rules/quality#functions) - Require arrow functions as callbacks

**Control Flow:**

- [`no-else-return`](/rules/quality#control-flow) - Disallow else blocks after return statements
- [`no-await-in-loop`](/rules/quality#control-flow) - Disallow await inside of loops

**Dangerous Features:**

- [`no-eval`](/rules/quality#dangerous-features) - Disallow eval()
- [`no-implied-eval`](/rules/quality#dangerous-features) - Disallow implied eval()
- [`no-new-func`](/rules/quality#dangerous-features) - Disallow new operators with Function object
- [`no-alert`](/rules/quality#dangerous-features) - Disallow the use of alert, confirm, and prompt
- [`no-caller`](/rules/quality#dangerous-features) - Disallow use of caller/callee
- [`no-with`](/rules/quality#dangerous-features) - Disallow with statements

**Objects & Prototypes:**

- [`no-extend-native`](/rules/quality#objects-prototypes) - Disallow extending native types
- [`no-global-assign`](/rules/quality#objects-prototypes) - Disallow assignment to native objects
- [`no-proto`](/rules/quality#objects-prototypes) - Disallow \_\_proto\_\_ property
- [`no-iterator`](/rules/quality#objects-prototypes) - Disallow \_\_iterator\_\_ property
- [`no-new-wrappers`](/rules/quality#objects-prototypes) - Disallow new operators with String, Number, and Boolean
- [`no-new`](/rules/quality#objects-prototypes) - Disallow new operators outside of assignments

**Code Quality:**

- [`no-empty`](/rules/quality#code-quality) - Disallow empty block statements
- [`no-case-declarations`](/rules/quality#code-quality) - Disallow lexical declarations in case clauses
- [`no-octal`](/rules/quality#code-quality) - Disallow octal literals
- [`no-return-assign`](/rules/quality#code-quality) - Disallow assignment in return statement
- [`no-sequences`](/rules/quality#code-quality) - Disallow comma operators
- [`no-throw-literal`](/rules/quality#code-quality) - Disallow throwing literals as exceptions
- [`no-useless-return`](/rules/quality#code-quality) - Disallow redundant return statements

**String & Type Operations:**

- [`no-useless-concat`](/rules/quality#string-type-operations) - Disallow unnecessary concatenation of strings
- [`no-useless-escape`](/rules/quality#string-type-operations) - Disallow unnecessary escape characters
- [`no-useless-rename`](/rules/quality#string-type-operations) - Disallow renaming import, export, and destructured assignments

**Boolean Logic:**

- [`no-extra-boolean-cast`](/rules/quality#boolean-logic) - Disallow unnecessary boolean casts
- [`no-lonely-if`](/rules/quality#boolean-logic) - Disallow if statements as the only statement in else blocks

**Modern JavaScript:**

- [`no-var`](/rules/quality#modern-javascript) - Require let or const instead of var

**Complexity Metrics:**

- [`complexity`](/rules/quality#complexity-metrics) - Enforce a maximum cyclomatic complexity (default: 20)
- [`max-depth`](/rules/quality#complexity-metrics) - Enforce a maximum depth that blocks can be nested (default: 4)
- [`max-lines-per-function`](/rules/quality#complexity-metrics) - Enforce a maximum number of lines per function (default: 300)

#### Pickier Plugin (`pickier/`)

Sorting and import organization (17 rules). See [pickier plugin documentation](/rules/pickier).

All rules:

- [`sort-objects`](/rules/sort-objects) - Sort object keys
- [`sort-imports`](/rules/sort-imports) - Sort import declarations
- [`sort-named-imports`](/rules/sort-named-imports) - Sort named import specifiers
- [`sort-heritage-clauses`](/rules/sort-heritage-clauses) - Sort heritage clauses (extends/implements)
- [`sort-keys`](/rules/sort-keys) - Sort object keys
- [`sort-exports`](/rules/sort-exports) - Sort export declarations
- [`sort-classes`](/rules/sort-classes) - Sort class members
- [`sort-enums`](/rules/sort-enums) - Sort enum members
- [`sort-interfaces`](/rules/sort-interfaces) - Sort interface members
- [`sort-maps`](/rules/sort-maps) - Sort Map entries
- [`sort-object-types`](/rules/sort-object-types) - Sort object type members
- [`sort-array-includes`](/rules/sort-array-includes) - Sort array `.includes()` values
- [`sort-switch-case`](/rules/sort-switch-case) - Sort switch case clauses
- `import-dedupe` - Remove duplicate imports
- `no-duplicate-imports` - Disallow duplicate imports

#### Style Plugin (`style/`)

Code style enforcement (50 rules, 34 with auto-fix). See [style plugin documentation](/rules/style).

**Spacing Rules:**

- [`keyword-spacing`](/rules/style-keyword-spacing) - Require space before/after keywords (`if`, `else`, `for`, `return`, etc.)
- [`arrow-spacing`](/rules/style-arrow-spacing) - Require space before/after `=>` in arrow functions
- [`space-infix-ops`](/rules/style-space-infix-ops) - Require spacing around infix operators (`&&`, `||`, `??`, `+=`, etc.)
- [`object-curly-spacing`](/rules/style-object-curly-spacing) - Require spaces inside `{ }` in objects and destructuring
- [`block-spacing`](/rules/style-block-spacing) - Require spaces inside single-line blocks `{ return x }`
- [`space-before-blocks`](/rules/style-space-before-blocks) - Require space before opening brace of blocks
- [`comma-spacing`](/rules/style-comma-spacing) - Require space after commas, disallow space before
- [`semi-spacing`](/rules/style-semi-spacing) - Disallow space before `;`, require space after
- [`rest-spread-spacing`](/rules/style-rest-spread-spacing) - Disallow space after spread/rest operator (`...`)
- [`key-spacing`](/rules/style-key-spacing) - Require space after `:` in object properties
- [`computed-property-spacing`](/rules/style-computed-property-spacing) - Disallow spaces inside computed property brackets `[expr]`
- [`array-bracket-spacing`](/rules/style-array-bracket-spacing) - Disallow spaces inside array brackets `[ ]`
- [`space-in-parens`](/rules/style-space-in-parens) - Disallow spaces inside parentheses `( )`
- [`template-curly-spacing`](/rules/style-template-curly-spacing) - Disallow spaces inside template literal `${ }`
- [`space-unary-ops`](/rules/style-space-unary-ops) - Space after `typeof`/`void`/`delete`, no space after `!`/`~`
- [`switch-colon-spacing`](/rules/style-switch-colon-spacing) - Enforce spacing around `:` in `case`/`default` clauses
- [`generator-star-spacing`](/rules/style-generator-star-spacing) - Enforce `function* foo()` (no space before `*`, space after)
- [`yield-star-spacing`](/rules/style-yield-star-spacing) - Enforce `yield* expr` (no space before `*`, space after)
- [`function-call-spacing`](/rules/style-function-call-spacing) - Disallow spaces between function name and `(` in calls
- [`template-tag-spacing`](/rules/style-template-tag-spacing) - Disallow space between tag function and template literal
- [`no-whitespace-before-property`](/rules/style-no-whitespace-before-property) - Disallow whitespace before `.` or `?.` in property access
- [`spaced-comment`](/rules/style-spaced-comment) - Require space after `//` and `/*` in comments

**Punctuation and Parens Rules:**

- [`comma-dangle`](/rules/style-comma-dangle) - Require trailing commas in multiline constructs
- [`arrow-parens`](/rules/style-arrow-parens) - Require parentheses around arrow function parameters
- [`space-before-function-paren`](/rules/style-space-before-function-paren) - Control spacing before `(` in function declarations
- [`quote-props`](/rules/style-quote-props) - Remove unnecessary quotes from object property keys
- [`no-floating-decimal`](/rules/style-no-floating-decimal) - Disallow `.5` (use `0.5`) and `2.` (use `2.0`)
- [`new-parens`](/rules/style-new-parens) - Require `new Foo()` not `new Foo`
- [`no-extra-parens`](/rules/style-no-extra-parens) - Remove redundant parentheses in `return (x)`
- [`wrap-iife`](/rules/style-wrap-iife) - Require parentheses around IIFEs

**Line Break and Block Rules:**

- [`comma-style`](/rules/style-comma-style) - Enforce comma-last style (not comma-first)
- [`dot-location`](/rules/style-dot-location) - Dot on the property line in chained calls
- [`operator-linebreak`](/rules/style-operator-linebreak) - Operators at the start of continued lines
- [`multiline-ternary`](/rules/style-multiline-ternary) - Enforce consistent multiline ternary expressions
- [`padded-blocks`](/rules/style-padded-blocks) - Disallow empty lines at the beginning/end of blocks
- [`lines-between-class-members`](/rules/style-lines-between-class-members) - Require blank line between class members
- [`brace-style`](/rules/style-brace-style) - Enforce consistent brace style for blocks
- [`curly`](/rules/style-curly) - Enforce consistent use of curly braces
- [`max-statements-per-line`](/rules/style-max-statements-per-line) - Limit statements per line
- [`if-newline`](/rules/style-if-newline) - Enforce newline after `if` when without braces
- [`consistent-chaining`](/rules/style-consistent-chaining) - Enforce consistent line breaks in method chains
- [`consistent-list-newline`](/rules/style-consistent-list-newline) - Enforce consistent newlines in arrays, objects, imports/exports
- [`indent-unindent`](/rules/style-indent-unindent) - Enforce consistent indentation in unindent-style tagged templates

**Expression Rules:**

- [`no-mixed-operators`](/rules/style-no-mixed-operators) - Disallow mixing `&&`/`||`/`??` without parentheses
- [`indent-binary-ops`](/rules/style-indent-binary-ops) - Enforce consistent indentation of binary operator continuation lines

**Whitespace Rules:**

- [`no-multi-spaces`](/rules/style-no-multi-spaces) - Disallow multiple consecutive spaces
- [`no-multiple-empty-lines`](/rules/style-no-multiple-empty-lines) - Disallow multiple consecutive blank lines
- [`no-trailing-spaces`](/rules/style-no-trailing-spaces) - Disallow trailing whitespace at the end of lines
- [`no-tabs`](/rules/style-no-tabs) - Disallow tab characters (when using spaces for indentation)
- [`no-mixed-spaces-and-tabs`](/rules/style-no-mixed-spaces-and-tabs) - Disallow mixed spaces and tabs for indentation

#### TypeScript Plugin (`ts/`)

TypeScript-specific rules (13 rules, 7 with auto-fix). See [TypeScript plugin documentation](/rules/ts).

**Type Safety Rules:**

- [`no-explicit-any`](/rules/ts-no-explicit-any) - Disallow the `any` type
- [`no-unsafe-assignment`](/rules/ts-no-unsafe-assignment) - Disallow assigning `any` typed values
- [`no-floating-promises`](/rules/ts-no-floating-promises) - Require promises to be awaited, returned, or `.catch()`'d
- [`no-misused-promises`](/rules/ts-no-misused-promises) - Disallow promises in places not designed for them
- [`prefer-nullish-coalescing`](/rules/ts-prefer-nullish-coalescing) - Prefer `??` over `||` for null/undefined checks
- [`prefer-optional-chain`](/rules/ts-prefer-optional-chain) - Prefer `?.` over chained `&&` for property access

**Module Rules:**

- [`no-require-imports`](/rules/ts-no-require-imports) - Disallow `require()` imports; prefer ESM
- [`no-ts-export-equal`](/rules/ts-no-ts-export-equal) - Disallow `export =`; prefer ESM `export default`
- [`no-top-level-await`](/rules/ts-no-top-level-await) - Disallow top-level `await` statements

**Formatting Rules:**

- [`member-delimiter-style`](/rules/ts-member-delimiter-style) - Enforce consistent `;` or `,` in interfaces and type literals
- [`type-annotation-spacing`](/rules/ts-type-annotation-spacing) - Require consistent spacing around `:` in type annotations
- [`type-generic-spacing`](/rules/ts-type-generic-spacing) - Disallow spaces inside generic angle brackets `Array< string >`
- [`type-named-tuple-spacing`](/rules/ts-type-named-tuple-spacing) - Require space after `:` in named tuple members `[name: string]`

#### RegExp Plugin (`regexp/`)

Regular expression safety (3 rules). See [RegExp plugin documentation](/rules/regexp).

All rules:

- [`no-super-linear-backtracking`](/rules/regexp-no-super-linear-backtracking) - Disallow exponential backtracking (ReDoS prevention)
- [`no-unused-capturing-group`](/rules/regexp-no-unused-capturing-group) - Disallow unused capturing groups
- `no-useless-lazy` - Disallow useless lazy quantifiers

#### publint Plugin (`publint/`)

Package.json validation for npm publishing (20 rules). See [publint plugin documentation](/rules/publint) for the complete list. Natively ported from [publint](https://publint.dev).

**Exports & Imports Ordering:**

- [`exports-types-should-be-first`](/rules/publint#exports-imports-ordering) - `types` condition must be first in exports
- [`exports-default-should-be-last`](/rules/publint#exports-imports-ordering) - `default` condition must be last in exports
- [`exports-module-should-precede-require`](/rules/publint#exports-imports-ordering) - `module` must come before `require`
- [`imports-default-should-be-last`](/rules/publint#exports-imports-ordering) - `default` must be last in imports
- [`imports-module-should-precede-require`](/rules/publint#exports-imports-ordering) - `module` must precede `require` in imports

**Exports & Imports Values:**

- [`exports-value-invalid`](/rules/publint#exports-imports-values) - Exports values must start with `./`
- [`imports-key-invalid`](/rules/publint#exports-imports-values) - Imports keys must start with `#`
- [`imports-value-invalid`](/rules/publint#exports-imports-values) - Relative imports values must start with `./`
- [`exports-missing-root-entrypoint`](/rules/publint#exports-imports-values) - Missing `"."` entrypoint when `main`/`module` exist
- [`exports-fallback-array-use`](/rules/publint#exports-imports-values) - Fallback arrays not recommended

**Package Structure:**

- [`use-type`](/rules/publint#package-structure) - `"type"` field should be specified
- [`has-module-but-no-exports`](/rules/publint#package-structure) - `module` without `exports`
- [`deprecated-field-jsnext`](/rules/publint#package-structure) - `jsnext:main` is deprecated
- [`field-invalid-value-type`](/rules/publint#package-structure) - Field type validation
- [`local-dependency`](/rules/publint#package-structure) - `file:` or `link:` dependencies

**File Verification:**

- [`file-does-not-exist`](/rules/publint#file-verification-tier-2) - Referenced files must exist
- [`file-invalid-format`](/rules/publint#file-verification-tier-2) - Code format must match extension
- [`module-should-be-esm`](/rules/publint#file-verification-tier-2) - `module` field must point to ESM
- [`bin-file-not-executable`](/rules/publint#file-verification-tier-2) - Bin files need shebang
- [`exports-module-should-be-esm`](/rules/publint#file-verification-tier-2) - `module` condition must be ESM

#### Markdown Plugin (`markdown/`)

Markdown documentation linting (53+ rules). See [markdown plugin documentation](/rules/markdown) for the complete list.

## Exploring Rules

You can explore the rule implementations directly in the codebase:

- Plugin definitions: `packages/pickier/src/plugins/`
- Rule implementations: `packages/pickier/src/rules/`
- Core linting logic: `packages/pickier/src/linter.ts`
- Formatter helpers: `packages/pickier/src/format.ts`

## Configuration

See [Advanced Configuration](/advanced/configuration-deep-dive) and [Plugin System](/advanced/plugin-system) for detailed configuration options.

## Best practices

- Start new rules at `warn` to gauge noise, then tighten to `error` where appropriate
- Prefer bare rule IDs in config (e.g., `'sort-imports'`), leverage category prefixes for discoverability (e.g., `'regexp/no-super-linear-backtracking'`)
- Keep sorting rules (`sort-objects`, `sort-keys`, `sort-exports`, `sort-imports`) enabled to reduce merge conflicts and diff noise
- Pair rules with the formatter for auto-fixes where supported
- Use group pages — [`pickier`](/rules/pickier), [`style`](/rules/style), [`ts`](/rules/ts), [`regexp`](/rules/regexp), [`publint`](/rules/publint) — to navigate related options and examples
- Keep `publint/` rules enabled to catch publishing issues before they reach npm
