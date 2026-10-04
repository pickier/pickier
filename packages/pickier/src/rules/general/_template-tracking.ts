import { lineStartsInTemplate } from '../../lexer'

/**
 * Compute, for each line of a TS/JS source, whether the line begins inside
 * a template-literal body (i.e. between an unclosed backtick and its
 * matching close).
 *
 * Used by rules like `prefer-const` and `pickier/no-unused-vars` to skip
 * generated code embedded in template strings — declarations and function
 * bodies inside a `\`<script>...\`` blob aren't real top-level code, and
 * applying lint rules to them produces false positives that fixers will
 * happily turn into broken runtime code.
 *
 * This was a scanner of its own, and it got two things wrong that the shared
 * lexer gets right: a regex after a keyword (`return /it's/`) read as
 * division, so its quote opened a string, and a quoted string did not end at
 * the end of its line. Either one left the state inverted for the rest of the
 * file, so the lines *outside* every template were the ones skipped.
 */
export function computeLineStartsInTemplate(text: string): boolean[] {
  return lineStartsInTemplate(text)
}
