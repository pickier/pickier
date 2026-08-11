import { describe, expect, it } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runLint } from '../../src/linter'

/**
 * The quotes rule reads code lexically, so it has to know where regex literals
 * and template literals begin and end. Both boundaries used to be approximated,
 * and each approximation produced quote warnings on correct code.
 */

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-quotes-'))
}

async function lint(source: string, options: { maxWarnings?: number } = {}): Promise<number> {
  const dir = tmp()
  writeFileSync(join(dir, 'input.ts'), source, 'utf8')
  return runLint([dir], { reporter: 'json', maxWarnings: options.maxWarnings ?? 0 })
}

describe('quotes: regex literal boundaries', () => {
  it('ignores quotes inside a regex that opens a line', async () => {
    // A regex passed as its own argument in a multi-line call has no operator
    // before it, which the old lookbehind required — so the body was read as
    // code and the double quotes inside it were flagged.
    const source = `const fixed = input.replace(
  /^(\\s*\\w+:\\s*)"(.+)",\\s*(.+)$/gm,
  'x',
)
export { fixed }
`
    expect(await lint(source)).toBe(0)
  })

  it('ignores quotes inside a regex assigned directly', async () => {
    expect(await lint('const re = /a"b/g\nexport { re }\n')).toBe(0)
  })

  it('does not end a regex at a slash inside a character class', async () => {
    const source = `const re = /[^/]+/g
const also = /["']/g
export { re, also }
`
    expect(await lint(source)).toBe(0)
  })

  it('still flags a genuine double-quoted string after a regex', async () => {
    const source = `const re = /[^/]+/g
const bad = "double quoted"
export { re, bad }
`
    expect(await lint(source)).toBe(1)
  })

  it('does not mistake a line comment for a regex', async () => {
    const source = `const a = 1 // note: "quoted" text
const b = 'ok'
export { a, b }
`
    expect(await lint(source)).toBe(0)
  })
})

describe('quotes: template literal boundaries', () => {
  it('ignores quotes on continuation lines of a template literal', async () => {
    const source = `const id = 'x'
const html = \`<li class="a">
<a href="#\${id}" class="link">text</a>
</li>\`
export { html }
`
    expect(await lint(source)).toBe(0)
  })

  it('is not desynced by backticks inside a regex', async () => {
    // /\`([^\`]+)\`/g holds three backticks. Counting them flipped the
    // "inside a template" state for the whole rest of the file, so quote
    // checking then ran over every template body below.
    const source = `const stripped = input.replace(/\`([^\`]+)\`/g, '$1')
const html = \`<li class="a">
<a href="#x" class="link">text</a>
</li>\`
export { stripped, html }
`
    expect(await lint(source)).toBe(0)
  })

  it('is not desynced by a backtick inside a string or comment', async () => {
    const source = `const tick = '\`'
// a stray \` in prose
const html = \`<div class="a">
<span class="b">text</span>
</div>\`
export { tick, html }
`
    expect(await lint(source)).toBe(0)
  })

  it('handles a template nested in an interpolation', async () => {
    const source = `const inner = 'i'
const html = \`<a class="x">\${[1].map(n => \`<b class="y">\${n}\${inner}</b>\`).join('')}</a>\`
export { html }
`
    expect(await lint(source)).toBe(0)
  })

  it('still flags a genuine double-quoted string after a template literal', async () => {
    const source = `const html = \`<div class="a">
</div>\`
const bad = "double quoted"
export { html, bad }
`
    expect(await lint(source)).toBe(1)
  })
})
