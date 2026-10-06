# markdown

The `markdown`plugin provides comprehensive linting rules for Markdown files, helping ensure consistency and best practices in your documentation.

- Category: Plugin
- Rules: 53 total
- Auto-fixable: 27 rules
- Default: All rules off (opt-in)

## Overview

The markdown plugin implements all standard markdownlint rules (MD001-MD060), organized into the following categories:

-**Headings**(11 rules) - Heading structure, style, and formatting
-**Lists**(6 rules) - List style, indentation, and spacing
-**Whitespace**(8 rules) - Trailing spaces, blank lines, and indentation
-**Links**(9 rules) - Link syntax, references, and validation
-**Code**(5 rules) - Code block formatting and style
-**Emphasis**(5 rules) - Emphasis and strong formatting
-**HTML**(6 rules) - HTML usage, images, and other elements
-**Tables**(3 rules) - Table formatting and structure

## Configuration

Enable markdown linting by adding rules to your`pluginRules`:

```ts
export default {
  pluginRules: {
    // Enable specific rules
    'markdown/heading-increment': 'error',
    'markdown/no-trailing-spaces': 'error',
    'markdown/no-duplicate-heading': 'warn',

    // Or use with options
    'markdown/line-length': ['warn', { line_length: 100 }],
    'markdown/ul-style': ['error', { style: 'dash' }],
  }
}
```## Auto-Fix Support

Many markdown rules support automatic fixes with the`--fix`flag:```bash
pickier lint docs --fix

```The following rules can be auto-fixed:**Whitespace (5 rules):**-`no-trailing-spaces`- Remove trailing spaces
-`no-hard-tabs`- Convert tabs to spaces
-`no-multiple-blanks`- Reduce consecutive blank lines
-`single-trailing-newline`- Ensure single trailing newline**Headings (6 rules):**-`no-missing-space-atx`- Add space after hash
-`no-multiple-space-atx`- Reduce to single space
-`no-trailing-punctuation`- Remove punctuation
-`blanks-around-headings`- Add blank lines around headings
-`heading-start-left`- Remove leading whitespace
-`no-multiple-space-blockquote`- Fix blockquote spacing**Lists (3 rules):**-`list-marker-space`- Fix list marker spacing
-`ul-style`- Convert to consistent marker style
-`ol-prefix`- Fix ordered list numbering**Code & Emphasis (5 rules):**-`code-fence-style`- Convert fence style (backtick/tilde)
-`emphasis-style`- Convert emphasis markers
-`strong-style`- Convert strong markers
-`no-space-in-emphasis`- Remove spaces in emphasis
-`no-space-in-code`- Remove spaces in code spans**Links & Other (4 rules):**-`no-bare-urls`- Wrap URLs in angle brackets
-`blanks-around-fences`- Add blank lines around code blocks
-`blanks-around-lists`- Add blank lines around lists

## Quick Start Preset

For a sensible default configuration, enable these commonly-used rules:```ts
export default {
  pluginRules: {
    // Heading rules
    'markdown/heading-increment': 'error',
    'markdown/no-duplicate-heading': 'warn',
    'markdown/no-trailing-punctuation': 'error',
    'markdown/single-title': 'error',

    // List rules
    'markdown/ul-style': ['error', { style: 'consistent' }],
    'markdown/list-marker-space': 'error',

    // Whitespace rules
    'markdown/no-trailing-spaces': 'error',
    'markdown/no-hard-tabs': 'error',
    'markdown/no-multiple-blanks': ['error', { maximum: 1 }],
    'markdown/single-trailing-newline': 'error',

    // Code rules
    'markdown/fenced-code-language': 'error',
    'markdown/code-fence-style': ['error', { style: 'backtick' }],

    // Link rules
    'markdown/no-bare-urls': 'error',
    'markdown/no-empty-links': 'error',

    // Other rules
    'markdown/no-alt-text': 'error',
  }
}
```## Heading Rules

### heading-increment (MD001)

Heading levels should only increment by one level at a time.```ts
'markdown/heading-increment': 'error'

```**Auto-fixable:**No**Invalid:**```markdown

# H1

### H3 (skipped H2)

```**Valid:**```markdown

# H1

## H2

### H3

```### heading-style (MD003)

Heading style should be consistent.```ts
'markdown/heading-style': ['error', { style: 'atx' | 'setext' | 'consistent' }]
```Options:

-`atx`- Use`#`style headings
-`setext`- Use underline style headings
-`consistent`(default) - Be consistent throughout the document

### no-missing-space-atx (MD018)

ATX style headings must have a space after the hash.```ts
'markdown/no-missing-space-atx': 'error'

```**Invalid:**`#Heading`**Valid:**`# Heading`**Auto-fixable:**Yes

### no-duplicate-heading (MD024)

Multiple headings should not have the same content.

```ts

'markdown/no-duplicate-heading': 'error'

```### single-title (MD025)

Document should have only one top-level heading (h1).```ts
'markdown/single-title': 'error'
```### no-trailing-punctuation (MD026)

Headings should not end with punctuation.```ts
'markdown/no-trailing-punctuation': ['error', { punctuation: '.,;:!?' }]

```**Invalid:**`# Heading.`**Valid:**`# Heading`## List Rules

### ul-style (MD004)

Unordered list style should be consistent.```ts
'markdown/ul-style': ['error', { style: 'asterisk' | 'dash' | 'plus' | 'consistent' }]
```**Consistent example:**```markdown

- Item 1
- Item 2
- Item 3

```### ul-indent (MD007)

Unordered list indentation should be consistent.```ts
'markdown/ul-indent': ['error', { indent: 2 }]
```Default: 2 spaces per level

### ol-prefix (MD029)

Ordered list item prefix style.```ts
'markdown/ol-prefix': ['error', { style: 'one' | 'ordered' | 'one_or_ordered' }]

```Options:

-`one`- All items use`1.`-`ordered`- Sequential numbering`1. 2. 3.`-`one_or_ordered`(default) - Either style is acceptable

### list-marker-space (MD030)

Spaces after list markers should be consistent.```ts
'markdown/list-marker-space': ['error', { ul_single: 1, ol_single: 1 }]
```### blanks-around-lists (MD032)

Lists should be surrounded by blank lines.```ts
'markdown/blanks-around-lists': 'error'

```## Whitespace Rules

### no-trailing-spaces (MD009)

Lines should not end with trailing spaces.```ts
'markdown/no-trailing-spaces': ['error', { br_spaces: 2 }]
```Options:

-`br_spaces`- Number of spaces allowed for hard line breaks (default: 2)**Auto-fixable:**Yes

### no-hard-tabs (MD010)

Spaces should be used instead of hard tabs.```ts
'markdown/no-hard-tabs': 'error'

```### no-multiple-blanks (MD012)

Multiple consecutive blank lines should not be used.```ts
'markdown/no-multiple-blanks': ['error', { maximum: 1 }]
```### blanks-around-fences (MD031)

Fenced code blocks should be surrounded by blank lines.```ts
'markdown/blanks-around-fences': 'error'

```### single-trailing-newline (MD047)

Files should end with a single newline character.```ts
'markdown/single-trailing-newline': 'error'
```## Code Rules

### line-length (MD013)

Lines should not exceed a specified length.```ts
'markdown/line-length': ['warn', {
  line_length: 80,
  code_blocks: true,
  tables: true,
  headings: true
}]

```### fenced-code-language (MD040)

Fenced code blocks should have a language specified.```ts
'markdown/fenced-code-language': 'error'
```**Invalid:**````markdown

```code();```
````**Valid:**````markdown

```javascript

code();

```````### code-fence-style (MD048)

Code fence style should be consistent.```ts
'markdown/code-fence-style': ['error', { style: 'backtick' | 'tilde' | 'consistent' }]

```## Link Rules

### no-bare-urls (MD034)

Bare URLs should be wrapped in angle brackets.```ts
'markdown/no-bare-urls': 'error'

```**Invalid:**`Check <http://example.co>m`**Valid:**`Check <http://example.com>`### no-empty-links (MD042)

Links should not be empty.```ts
'markdown/no-empty-links': 'error'

```**Invalid:**`[text]()`or`[](url)`**Valid:**`[text](url)`### descriptive-link-text (MD059)

Link text should be meaningful and descriptive.```ts
'markdown/descriptive-link-text': 'warn'

```**Invalid:**`[click here](url)`**Valid:**`[Visit the documentation](url)`## Emphasis Rules

### emphasis-style (MD049)

Emphasis style should be consistent.```ts
'markdown/emphasis-style': ['error', { style: 'asterisk' | 'underscore' | 'consistent' }]

```### strong-style (MD050)

Strong style should be consistent.```ts
'markdown/strong-style': ['error', { style: 'asterisk' | 'underscore' | 'consistent' }]

```### no-space-in-emphasis (MD037)

Emphasis markers should not have spaces inside them.```ts
'markdown/no-space-in-emphasis': 'error'

```**Invalid:**`**text**`**Valid:**`**text**`### no-space-in-code (MD038)

Code span elements should not have spaces inside the backticks.```ts
'markdown/no-space-in-code': 'error'

```**Invalid:**`` `code` ``**Valid:**`` `code` ``## HTML and Other Rules

### no-inline-html (MD033)

Inline HTML should not be used.```ts
'markdown/no-inline-html': ['warn', { allowed_elements: ['br', 'img'] }]

```### first-line-heading (MD041)

First line in a file should be a top-level heading.```ts
'markdown/first-line-heading': 'warn'

```### no-alt-text (MD045)

Images should have alternate text (alt text).```ts
'markdown/no-alt-text': 'error'

```**Invalid:**`![](image.png)`**Valid:**`![Description](image.png)`## Table Rules

### table-pipe-style (MD055)

Table pipe style should be consistent.```ts
'markdown/table-pipe-style': ['error', {
  style: 'leading_and_trailing' | 'leading_only' | 'trailing_only' | 'no_leading_or_trailing'
}]

```### table-column-count (MD056)

Table rows should have consistent column counts.```ts
'markdown/table-column-count': 'error'

```### blanks-around-tables (MD058)

Tables should be surrounded by blank lines.```ts
'markdown/blanks-around-tables': 'error'

```## Complete Rule List

All 53 markdown rules with their MD numbers:

| Rule ID | MD# | Description |
|---------|-----|-------------|
| heading-increment | MD001 | Heading levels should only increment by one level at a time |
| heading-style | MD003 | Heading style consistency |
| ul-style | MD004 | Unordered list style |
| list-indent | MD005 | Inconsistent indentation for list items |
| ul-indent | MD007 | Unordered list indentation |
| no-trailing-spaces | MD009 | Trailing spaces |
| no-hard-tabs | MD010 | Hard tabs |
| no-reversed-links | MD011 | Reversed link syntax |
| no-multiple-blanks | MD012 | Multiple consecutive blank lines |
| line-length | MD013 | Line length |
| commands-show-output | MD014 | Dollar signs used before commands |
| no-missing-space-atx | MD018 | No space after hash on atx style heading |
| no-multiple-space-atx | MD019 | Multiple spaces after hash |
| no-missing-space-closed-atx | MD020 | No space inside hashes on closed atx |
| no-multiple-space-closed-atx | MD021 | Multiple spaces inside hashes |
| blanks-around-headings | MD022 | Headings surrounded by blank lines |
| heading-start-left | MD023 | Headings must start at beginning of line |
| no-duplicate-heading | MD024 | Multiple headings with same content |
| single-title | MD025 | Multiple top-level headings |
| no-trailing-punctuation | MD026 | Trailing punctuation in heading |
| no-multiple-space-blockquote | MD027 | Multiple spaces after blockquote symbol |
| no-blanks-blockquote | MD028 | Blank line inside blockquote |
| ol-prefix | MD029 | Ordered list item prefix |
| list-marker-space | MD030 | Spaces after list markers |
| blanks-around-fences | MD031 | Fenced code blocks surrounded by blank lines |
| blanks-around-lists | MD032 | Lists surrounded by blank lines |
| no-inline-html | MD033 | Inline HTML |
| no-bare-urls | MD034 | Bare URL used |
| hr-style | MD035 | Horizontal rule style |
| no-emphasis-as-heading | MD036 | Emphasis used instead of heading |
| no-space-in-emphasis | MD037 | Spaces inside emphasis markers |
| no-space-in-code | MD038 | Spaces inside code span elements |
| no-space-in-links | MD039 | Spaces inside link text |
| fenced-code-language | MD040 | Fenced code language specification |
| first-line-heading | MD041 | First line should be top-level heading |
| no-empty-links | MD042 | No empty links |
| required-headings | MD043 | Required heading structure |
| proper-names | MD044 | Proper names capitalization |
| no-alt-text | MD045 | Images should have alt text |
| code-block-style | MD046 | Code block style |
| single-trailing-newline | MD047 | Files end with single newline |
| code-fence-style | MD048 | Code fence style |
| emphasis-style | MD049 | Emphasis style |
| strong-style | MD050 | Strong style |
| link-fragments | MD051 | Link fragments should be valid |
| reference-links-images | MD052 | Reference links should be defined |
| link-image-reference-definitions | MD053 | Reference definitions should be needed |
| link-image-style | MD054 | Link and image style |
| table-pipe-style | MD055 | Table pipe style |
| table-column-count | MD056 | Table column count |
| blanks-around-tables | MD058 | Tables surrounded by blank lines |
| descriptive-link-text | MD059 | Link text should be descriptive |
| table-column-style | MD060 | Table column style |

## Best Practices

1.**Start with core rules**- Enable essential rules like`heading-increment`, `no-trailing-spaces`, and `single-trailing-newline` first
2.**Use consistent style**- Configure style rules (`ul-style`, `emphasis-style`, `strong-style`) to match your team's preferences
3.**Warn before error**- Start new rules at `warn`to gauge noise before upgrading to`error`4.**Configure line length**- Set`line-length`to match your documentation style guide (80, 100, or 120 characters are common)
5.**Enable code block rules**- Always specify language for fenced code blocks for better syntax highlighting
6.**Validate links**- Use link validation rules to catch broken references and fragments
7.**Pair with formatter**- Many whitespace rules work best when paired with auto-formatting

## Examples

### Basic Configuration```ts

export default {
  lint: {
    extensions: ['md'], // Enable markdown linting
  },
  pluginRules: {
    'markdown/heading-increment': 'error',
    'markdown/no-trailing-spaces': 'error',
    'markdown/fenced-code-language': 'error',
  }
}

```### Strict Documentation Standards```ts

export default {
  pluginRules: {
    // Headings
    'markdown/heading-increment': 'error',
    'markdown/heading-style': ['error', { style: 'atx' }],
    'markdown/single-title': 'error',
    'markdown/no-duplicate-heading': 'error',
    'markdown/blanks-around-headings': 'error',

    // Lists
    'markdown/ul-style': ['error', { style: 'dash' }],
    'markdown/ul-indent': ['error', { indent: 2 }],
    'markdown/ol-prefix': ['error', { style: 'ordered' }],
    'markdown/blanks-around-lists': 'error',

    // Code
    'markdown/fenced-code-language': 'error',
    'markdown/code-fence-style': ['error', { style: 'backtick' }],
    'markdown/blanks-around-fences': 'error',

    // Whitespace
    'markdown/no-trailing-spaces': 'error',
    'markdown/no-hard-tabs': 'error',
    'markdown/no-multiple-blanks': ['error', { maximum: 1 }],
    'markdown/single-trailing-newline': 'error',

    // Links
    'markdown/no-bare-urls': 'error',
    'markdown/no-empty-links': 'error',
    'markdown/descriptive-link-text': 'warn',

    // Tables
    'markdown/table-pipe-style': 'error',
    'markdown/table-column-count': 'error',
    'markdown/blanks-around-tables': 'error',
  }
}

```

## See Also

- [Configuration](/config) - General configuration options
- [Linting Basics](/features/linting-basics) - Understanding linting in Pickier
- [Plugin System](/advanced/plugin-system) - How plugins work
