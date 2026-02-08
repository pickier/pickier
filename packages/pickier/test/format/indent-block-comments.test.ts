import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hasIndentIssue } from '../../src/format'
import { runLintProgrammatic } from '../../src/index'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-indent-'))
}

describe('hasIndentIssue - block comment continuation lines', () => {
  it('should not flag block comment continuation with +1 offset', () => {
    // Standard JSDoc pattern: 2-space base indent + 1 space for * alignment = 3 spaces
    expect(hasIndentIssue('   ', 2, 'spaces', '   * @param x the value')).toBe(false)
  })

  it('should not flag block comment closing with +1 offset', () => {
    expect(hasIndentIssue('   ', 2, 'spaces', '   */')).toBe(false)
  })

  it('should not flag bare asterisk in block comment with +1 offset', () => {
    expect(hasIndentIssue('   ', 2, 'spaces', '   *')).toBe(false)
  })

  it('should not flag deeply nested block comments with +1 offset', () => {
    // 4 indent levels (8 spaces) + 1 for * alignment = 9 spaces
    expect(hasIndentIssue('         ', 2, 'spaces', '         * deep comment')).toBe(false)
  })

  it('should still flag non-comment lines with odd indentation', () => {
    expect(hasIndentIssue('   ', 2, 'spaces', '   const x = 1')).toBe(true)
  })

  it('should still flag comment lines with wrong offset', () => {
    // 4 spaces is valid (multiple of 2), not a +1 issue
    expect(hasIndentIssue('    ', 2, 'spaces', '    * comment')).toBe(false)
    // 5 spaces: this is 4 + 1 for *, so should NOT be flagged
    expect(hasIndentIssue('     ', 2, 'spaces', '     * comment')).toBe(false)
  })

  it('should work with 4-space indent config', () => {
    // 4-space indent: base 4 + 1 for * = 5 spaces
    expect(hasIndentIssue('     ', 4, 'spaces', '     * comment')).toBe(false)
    // base 8 + 1 for * = 9 spaces
    expect(hasIndentIssue('         ', 4, 'spaces', '         * comment')).toBe(false)
    // 6 spaces is not valid: 6 % 4 = 2, and the line is not a block comment
    expect(hasIndentIssue('      ', 4, 'spaces', '      const x = 1')).toBe(true)
  })

  it('should work without lineContent (backwards compatible)', () => {
    expect(hasIndentIssue('  ', 2, 'spaces')).toBe(false)
    expect(hasIndentIssue('   ', 2, 'spaces')).toBe(true)
    expect(hasIndentIssue('    ', 2, 'spaces')).toBe(false)
  })
})

describe('indent check skips fenced code blocks in markdown', () => {
  it('should not flag indentation inside markdown fenced code blocks', async () => {
    const dir = tmp()
    const file = join(dir, 'test.md')
    writeFileSync(file, `# Title

Some text.

\`\`\`bash
 # This has 1-space indent (odd) - should NOT be flagged
   cd my-project
 bun install
\`\`\`

More text.
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })

  it('should still flag indentation outside fenced code blocks in TS files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    // 3 spaces is odd indentation for 2-space config
    writeFileSync(file, '   const _x = 1\n', 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues.length).toBeGreaterThan(0)
  })

  it('should not flag JSDoc comments in TypeScript files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, `/**
 * A function description
 * @param x the value
 */
function test(x: number): number {
  return x
}
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })

  it('should not flag nested JSDoc in TypeScript files', async () => {
    const dir = tmp()
    const file = join(dir, 'test.ts')
    writeFileSync(file, `class MyClass {
  /**
   * A method description
   * @returns the result
   */
  method(): number {
    return 1
  }
}
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })

  it('should not flag CSS block comments', async () => {
    const dir = tmp()
    const file = join(dir, 'test.css')
    writeFileSync(file, `:root {
  --color: blue;
}

/**
 * Component: Hero
 * -------------------------------------------------------------------------- */
.hero {
  color: red;
}
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })

  it('handles multiple fenced code blocks in markdown', async () => {
    const dir = tmp()
    const file = join(dir, 'test.md')
    writeFileSync(file, `# Title

\`\`\`bash
 # odd indent 1
   cd somewhere
\`\`\`

Some text between.

\`\`\`typescript
   const x = 1
     if (true) {
       console.log(x)
     }
\`\`\`

End text.
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })

  it('handles tilde-style fenced code blocks', async () => {
    const dir = tmp()
    const file = join(dir, 'test.md')
    writeFileSync(file, `# Title

~~~bash
 # odd indent inside tildes
   cd dir
~~~
`, 'utf8')

    const res = await runLintProgrammatic([file], { reporter: 'json', maxWarnings: -1 })
    const indentIssues = res.issues.filter(i => i.ruleId === 'indent')
    expect(indentIssues).toHaveLength(0)
  })
})
