/**
 * Markdown formatting — Pickier vs oxfmt vs Prettier, in memory
 *
 * Every tool formats the same string in-process through its JS API, so no
 * process spawn or file I/O is measured:
 *
 *   Pickier   formatCode(src, config, 'doc.md')
 *   oxfmt     format('doc.md', src)               (napi binding, oxfmt >= 0.72)
 *   Prettier  format(src, { parser: 'markdown' })
 *
 * For whole-repository numbers (CLI vs CLI on mdn/content) run
 * `bun run bench:markdown-corpus`.
 *
 * Run: bun run bench:markdown
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bench, do_not_optimize, group, run } from 'mitata'
import { format as oxfmtFormat } from 'oxfmt'
import * as prettier from 'prettier'
import { defaultConfig, formatCode } from '../../packages/pickier/src/index'

const sizes = ['small', 'medium', 'large'] as const
type Size = typeof sizes[number]

const content = Object.fromEntries(
  sizes.map(s => [s, readFileSync(resolve(__dirname, `../fixtures/markdown/${s}.md`), 'utf-8')]),
) as Record<Size, string>

const describe = (s: Size) => {
  const lines = content[s].split('\n').length
  const kb = (Buffer.byteLength(content[s], 'utf8') / 1024).toFixed(1)
  return `${lines} lines, ${kb} KB`
}

const cfg = { ...defaultConfig }

// A tool that errors out early would look fast. Make sure each one actually
// formats every fixture before timing anything.
for (const s of sizes) {
  const ox = await oxfmtFormat('doc.md', content[s])
  if (ox.errors.length > 0)
    throw new Error(`oxfmt failed on ${s}.md: ${ox.errors[0].message}`)
  await prettier.format(content[s], { parser: 'markdown' })
  formatCode(content[s], cfg, 'doc.md')
}

console.log(`\n${'='.repeat(80)}`)
console.log('     MARKDOWN — Pickier vs oxfmt vs Prettier (in-memory JS APIs)')
console.log('='.repeat(80))
for (const s of sizes)
  console.log(`  ${s.padEnd(6)}  ${describe(s)}`)
console.log(`${'='.repeat(80)}\n`)

for (const s of sizes) {
  group(`Markdown — ${s} (${describe(s)})`, () => {
    bench('Pickier', () => {
      do_not_optimize(formatCode(content[s], cfg, 'doc.md'))
    })

    bench('oxfmt', async () => {
      do_not_optimize(await oxfmtFormat('doc.md', content[s]))
    })

    bench('Prettier', async () => {
      do_not_optimize(await prettier.format(content[s], { parser: 'markdown' }))
    })
  })
}

group('Markdown — throughput (all fixtures x 10)', () => {
  bench('Pickier', () => {
    for (let i = 0; i < 10; i++) {
      for (const s of sizes)
        do_not_optimize(formatCode(content[s], cfg, 'doc.md'))
    }
  })

  bench('oxfmt', async () => {
    for (let i = 0; i < 10; i++) {
      for (const s of sizes)
        do_not_optimize(await oxfmtFormat('doc.md', content[s]))
    }
  })

  bench('Prettier', async () => {
    for (let i = 0; i < 10; i++) {
      for (const s of sizes)
        do_not_optimize(await prettier.format(content[s], { parser: 'markdown' }))
    }
  })
})

await run({ colors: true })
