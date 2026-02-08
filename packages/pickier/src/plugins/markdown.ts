import type { LintIssue, PickierPlugin, RuleContext, RuleModule } from '../types'

import { blanksAroundFencesRule } from '../rules/markdown/blanks-around-fences'
import { blanksAroundHeadingsRule } from '../rules/markdown/blanks-around-headings'
import { blanksAroundListsRule } from '../rules/markdown/blanks-around-lists'
import { blanksAroundTablesRule } from '../rules/markdown/blanks-around-tables'
import { codeBlockStyleRule } from '../rules/markdown/code-block-style'
import { codeFenceStyleRule } from '../rules/markdown/code-fence-style'
import { commandsShowOutputRule } from '../rules/markdown/commands-show-output'
import { descriptiveLinkTextRule } from '../rules/markdown/descriptive-link-text'
import { emphasisStyleRule } from '../rules/markdown/emphasis-style'
import { fencedCodeLanguageRule } from '../rules/markdown/fenced-code-language'
import { firstLineHeadingRule } from '../rules/markdown/first-line-heading'

// Heading rules
import { headingIncrementRule } from '../rules/markdown/heading-increment'
import { headingStartLeftRule } from '../rules/markdown/heading-start-left'
import { headingStyleRule } from '../rules/markdown/heading-style'
import { hrStyleRule } from '../rules/markdown/hr-style'
// Code rules
import { lineLengthRule } from '../rules/markdown/line-length'
import { linkFragmentsRule } from '../rules/markdown/link-fragments'

import { linkImageReferenceDefinitionsRule } from '../rules/markdown/link-image-reference-definitions'
import { linkImageStyleRule } from '../rules/markdown/link-image-style'
import { listIndentRule } from '../rules/markdown/list-indent'
import { listMarkerSpaceRule } from '../rules/markdown/list-marker-space'
import { noAltTextRule } from '../rules/markdown/no-alt-text'
import { noBareUrlsRule } from '../rules/markdown/no-bare-urls'
import { noBlanksBlockquoteRule } from '../rules/markdown/no-blanks-blockquote'
import { noDuplicateHeadingRule } from '../rules/markdown/no-duplicate-heading'

// Emphasis/Strong rules
import { noEmphasisAsHeadingRule } from '../rules/markdown/no-emphasis-as-heading'
import { noEmptyLinksRule } from '../rules/markdown/no-empty-links'
import { noHardTabsRule } from '../rules/markdown/no-hard-tabs'
// HTML and other rules
import { noInlineHtmlRule } from '../rules/markdown/no-inline-html'
import { noMissingSpaceAtxRule } from '../rules/markdown/no-missing-space-atx'
import { noMissingSpaceClosedAtxRule } from '../rules/markdown/no-missing-space-closed-atx'
import { noMultipleBlanksRule } from '../rules/markdown/no-multiple-blanks'
import { noMultipleSpaceAtxRule } from '../rules/markdown/no-multiple-space-atx'
import { noMultipleSpaceBlockquoteRule } from '../rules/markdown/no-multiple-space-blockquote'

import { noMultipleSpaceClosedAtxRule } from '../rules/markdown/no-multiple-space-closed-atx'
// Link rules
import { noReversedLinksRule } from '../rules/markdown/no-reversed-links'
import { noSpaceInCodeRule } from '../rules/markdown/no-space-in-code'
import { noSpaceInEmphasisRule } from '../rules/markdown/no-space-in-emphasis'
import { noSpaceInLinksRule } from '../rules/markdown/no-space-in-links'

import { noTrailingPunctuationRule } from '../rules/markdown/no-trailing-punctuation'
// Whitespace rules
import { noTrailingSpacesRule } from '../rules/markdown/no-trailing-spaces'
import { olPrefixRule } from '../rules/markdown/ol-prefix'
import { properNamesRule } from '../rules/markdown/proper-names'
import { referenceLinksImagesRule } from '../rules/markdown/reference-links-images'

import { requiredHeadingsRule } from '../rules/markdown/required-headings'
import { singleTitleRule } from '../rules/markdown/single-title'
import { singleTrailingNewlineRule } from '../rules/markdown/single-trailing-newline'
import { strongStyleRule } from '../rules/markdown/strong-style'
import { tableColumnCountRule } from '../rules/markdown/table-column-count'
import { tableColumnStyleRule } from '../rules/markdown/table-column-style'

// Table rules
import { tablePipeStyleRule } from '../rules/markdown/table-pipe-style'
import { ulIndentRule } from '../rules/markdown/ul-indent'
// List rules
import { ulStyleRule } from '../rules/markdown/ul-style'

/**
 * Strip YAML frontmatter from markdown content, replacing it with blank lines
 * to preserve line numbers. Returns the stripped text, original frontmatter,
 * and the end line number of the frontmatter (1-indexed).
 */
function stripFrontmatter(content: string): { text: string, frontmatter: string[] | null, frontmatterEndLine: number } {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---')
    return { text: content, frontmatter: null, frontmatterEndLine: 0 }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      const frontmatter = lines.slice(0, i + 1)
      const blanked = frontmatter.map(() => '')
      return {
        text: [...blanked, ...lines.slice(i + 1)].join('\n'),
        frontmatter,
        frontmatterEndLine: i + 1,
      }
    }
  }
  return { text: content, frontmatter: null, frontmatterEndLine: 0 }
}

function restoreFrontmatter(content: string, frontmatter: string[] | null): string {
  if (!frontmatter)
    return content
  const lines = content.split(/\r?\n/)
  return [...frontmatter, ...lines.slice(frontmatter.length)].join('\n')
}

// Helper function to wrap markdown rules so they only run on .md files
// Also strips YAML frontmatter so rules don't flag frontmatter content
function markdownOnly(rule: RuleModule): RuleModule {
  return {
    meta: rule.meta,
    check: (content: string, context: RuleContext): LintIssue[] => {
      if (!context.filePath.endsWith('.md'))
        return []
      const { text, frontmatterEndLine } = stripFrontmatter(content)
      const issues = rule.check(text, context)
      // Filter out issues on frontmatter lines and the boundary line after
      // (frontmatter stripping creates blank lines that can trigger false positives)
      if (frontmatterEndLine > 0)
        return issues.filter(issue => issue.line > frontmatterEndLine + 1)
      return issues
    },
    fix: rule.fix
      ? (content: string, context: RuleContext): string => {
          if (!context.filePath.endsWith('.md'))
            return content
          const { text, frontmatter } = stripFrontmatter(content)
          const fixed = rule.fix!(text, context)
          return restoreFrontmatter(fixed, frontmatter)
        }
      : undefined,
  }
}

export const markdownPlugin: PickierPlugin = {
  name: 'markdown',
  rules: {
    // Heading rules (MD001, MD003, MD018-MD026)
    'heading-increment': markdownOnly(headingIncrementRule),
    'heading-style': markdownOnly(headingStyleRule),
    'no-missing-space-atx': markdownOnly(noMissingSpaceAtxRule),
    'no-multiple-space-atx': markdownOnly(noMultipleSpaceAtxRule),
    'no-missing-space-closed-atx': markdownOnly(noMissingSpaceClosedAtxRule),
    'no-multiple-space-closed-atx': markdownOnly(noMultipleSpaceClosedAtxRule),
    'blanks-around-headings': markdownOnly(blanksAroundHeadingsRule),
    'heading-start-left': markdownOnly(headingStartLeftRule),
    'no-duplicate-heading': markdownOnly(noDuplicateHeadingRule),
    'single-title': markdownOnly(singleTitleRule),
    'no-trailing-punctuation': markdownOnly(noTrailingPunctuationRule),

    // List rules (MD004, MD005, MD007, MD029, MD030, MD032)
    'ul-style': markdownOnly(ulStyleRule),
    'list-indent': markdownOnly(listIndentRule),
    'ul-indent': markdownOnly(ulIndentRule),
    'ol-prefix': markdownOnly(olPrefixRule),
    'list-marker-space': markdownOnly(listMarkerSpaceRule),
    'blanks-around-lists': markdownOnly(blanksAroundListsRule),

    // Whitespace rules (MD009, MD010, MD012, MD022, MD027, MD028, MD031, MD047, MD058)
    'no-trailing-spaces': markdownOnly(noTrailingSpacesRule),
    'no-hard-tabs': markdownOnly(noHardTabsRule),
    'no-multiple-blanks': markdownOnly(noMultipleBlanksRule),
    'no-multiple-space-blockquote': markdownOnly(noMultipleSpaceBlockquoteRule),
    'no-blanks-blockquote': markdownOnly(noBlanksBlockquoteRule),
    'blanks-around-fences': markdownOnly(blanksAroundFencesRule),
    'single-trailing-newline': markdownOnly(singleTrailingNewlineRule),
    'blanks-around-tables': markdownOnly(blanksAroundTablesRule),

    // Link rules (MD011, MD034, MD039, MD042, MD051-MD054, MD059)
    'no-reversed-links': markdownOnly(noReversedLinksRule),
    'no-bare-urls': markdownOnly(noBareUrlsRule),
    'no-space-in-links': markdownOnly(noSpaceInLinksRule),
    'no-empty-links': markdownOnly(noEmptyLinksRule),
    'link-fragments': markdownOnly(linkFragmentsRule),
    'reference-links-images': markdownOnly(referenceLinksImagesRule),
    'link-image-reference-definitions': markdownOnly(linkImageReferenceDefinitionsRule),
    'link-image-style': markdownOnly(linkImageStyleRule),
    'descriptive-link-text': markdownOnly(descriptiveLinkTextRule),

    // Code rules (MD013, MD014, MD040, MD046, MD048)
    'line-length': markdownOnly(lineLengthRule),
    'commands-show-output': markdownOnly(commandsShowOutputRule),
    'fenced-code-language': markdownOnly(fencedCodeLanguageRule),
    'code-block-style': markdownOnly(codeBlockStyleRule),
    'code-fence-style': markdownOnly(codeFenceStyleRule),

    // Emphasis/Strong rules (MD036, MD037, MD038, MD049, MD050)
    'no-emphasis-as-heading': markdownOnly(noEmphasisAsHeadingRule),
    'no-space-in-emphasis': markdownOnly(noSpaceInEmphasisRule),
    'no-space-in-code': markdownOnly(noSpaceInCodeRule),
    'emphasis-style': markdownOnly(emphasisStyleRule),
    'strong-style': markdownOnly(strongStyleRule),

    // HTML and other rules (MD033, MD035, MD041, MD043-MD045)
    'no-inline-html': markdownOnly(noInlineHtmlRule),
    'hr-style': markdownOnly(hrStyleRule),
    'first-line-heading': markdownOnly(firstLineHeadingRule),
    'required-headings': markdownOnly(requiredHeadingsRule),
    'proper-names': markdownOnly(properNamesRule),
    'no-alt-text': markdownOnly(noAltTextRule),

    // Table rules (MD055, MD056, MD060)
    'table-pipe-style': markdownOnly(tablePipeStyleRule),
    'table-column-count': markdownOnly(tableColumnCountRule),
    'table-column-style': markdownOnly(tableColumnStyleRule),
  },
}
