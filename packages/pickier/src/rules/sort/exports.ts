import type { RuleModule } from '../../types'

// Simple heuristic: detect contiguous blocks of `export { X } from 'path'` lines
// and warn when they are not sorted according to options.
// Options: { type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'; order?: 'asc' | 'desc'; ignoreCase?: boolean; partitionByNewLine?: boolean }

interface Options {
  type?: 'alphabetical' | 'natural' | 'line-length' | 'unsorted'
  order?: 'asc' | 'desc'
  ignoreCase?: boolean
  partitionByNewLine?: boolean
}

function cmp(a: string, b: string, opts: Options): number {
  const order = opts.order === 'desc' ? -1 : 1
  const type = opts.type || 'alphabetical'
  const ia = opts.ignoreCase ? a.toLowerCase() : a
  const ib = opts.ignoreCase ? b.toLowerCase() : b
  if (type === 'line-length')
    return (ia.length - ib.length) * order
  if (type === 'natural')
    return ia.localeCompare(ib, undefined, { numeric: true, sensitivity: 'base' }) * order
  if (type === 'unsorted')
    return 0
  // alphabetical
  return ia.localeCompare(ib) * order
}

const exportLineRe = new RegExp('^export\\s+\\{[^}]*\\}\\s+from\\s+[\'"][^\'"]+[\'"]' + ';' + '?\\s*$')
function isExportLine(s: string): boolean {
  return exportLineRe.test(s)
}

export const sortExportsRule: RuleModule = {
  meta: { docs: 'Ensure contiguous export statements are sorted consistently.' },
  check: (text, ctx) => {
    const issues: ReturnType<RuleModule['check']> = []
    const opts: Options = ((ctx.config.pluginRules?.['pickier/sort-exports'] as any)?.[1]) || {}

    const lines = text.split(/\r?\n/)
    let i = 0
    while (i < lines.length) {
      // Skip until we hit an export or end
      while (i < lines.length && !isExportLine(lines[i])) i++
      if (i >= lines.length)
        break

      const block: { idx: number, line: string }[] = []
      let j = i
      while (j < lines.length) {
        const ln = lines[j]
        if (isExportLine(ln)) {
          block.push({ idx: j, line: ln })
          j++
          continue
        }
        // Non-export line
        if (opts.partitionByNewLine && ln.trim() === '')
          break // end this block due to blank line
        else
          break // contiguous block ends on first non-export
      }

      if (block.length > 1) {
        const original = block.map(b => b.line)
        const sorted = [...original].sort((a, b) => cmp(a, b, opts))
        const isSorted = original.every((l, k) => l === sorted[k])
        if (!isSorted) {
          const firstMisIdx = original.findIndex((l, k) => l !== sorted[k])
          const ln = block[firstMisIdx]?.idx ?? block[0].idx
          issues.push({
            filePath: ctx.filePath,
            line: ln + 1,
            column: 1,
            ruleId: 'pickier/sort-exports',
            message: 'Export statements are not sorted.',
            severity: 'warning',
          })
        }
      }

      // Continue scanning after this block
      i = j + 1
    }

    return issues
  },
  fix: (text, ctx) => {
    const opts: Options = ((ctx.config.pluginRules?.['pickier/sort-exports'] as any)?.[1]) || {}
    const lines = text.split(/\r?\n/)
    const out = [...lines]

    let i = 0
    while (i < out.length) {
      while (i < out.length && !isExportLine(out[i])) i++
      if (i >= out.length)
        break

      // const start = i
      const blockIdx: number[] = []
      let j = i
      while (j < out.length) {
        const ln = out[j]
        if (isExportLine(ln)) {
          blockIdx.push(j)
          j++
          continue
        }
        if (opts.partitionByNewLine && ln.trim() === '')
          break
        else
          break
      }

      if (blockIdx.length > 1) {
        const original = blockIdx.map(idx => out[idx])
        const sorted = [...original].sort((a, b) => cmp(a, b, opts))
        const isSorted = original.every((l, k) => l === sorted[k])
        if (!isSorted) {
          // Write back sorted lines into their positions
          blockIdx.forEach((idx, k) => {
            out[idx] = sorted[k]
          })
        }
      }

      i = j + 1
    }

    return out.join('\n')
  },
}
