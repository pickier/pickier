/**
 * Identify genuine GFM table rows in a markdown document. A row counts as
 * a table row when it is part of a block that includes a separator row of
 * the form `|---|---|` (pipes + dashes, optional colons for alignment).
 * Stray `|` characters inside paragraphs are ignored.
 */
export function findTableRows(lines: string[]): Set<number> {
  const rows = new Set<number>()
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^(?:`{3,}|~{3,})/.test(l.trim())) {
      fence = !fence
      continue
    }
    if (fence)
      continue
    if (!isSeparatorRow(l))
      continue
    if (i > 0 && /\|/.test(lines[i - 1]) && lines[i - 1].trim().length > 0)
      rows.add(i - 1)
    rows.add(i)
    for (let j = i + 1; j < lines.length; j++) {
      const r = lines[j]
      if (r.trim().length === 0 || !/\|/.test(r))
        break
      rows.add(j)
    }
  }
  return rows
}

/**
 * Return true when the line is a GFM table separator row — i.e. it contains
 * only pipes, dashes, colons (alignment), and whitespace, has at least one
 * pipe, and has at least one run of 3+ dashes.
 */
function isSeparatorRow(line: string): boolean {
  const s = line.trim()
  if (!s.includes('|'))
    return false
  if (!/^[|\s:-]+$/.test(s))
    return false
  if (!/-{3,}/.test(s))
    return false
  return true
}
