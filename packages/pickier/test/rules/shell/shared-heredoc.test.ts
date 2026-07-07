import { describe, expect, it } from 'bun:test'
import { heredocDelimiter } from '../../../src/rules/shell/_shared'

describe('heredocDelimiter', () => {
  it('extracts a bare delimiter', () => {
    expect(heredocDelimiter('cat << EOF')).toBe('EOF')
  })

  it('extracts a single-quoted delimiter', () => {
    expect(heredocDelimiter('cat << \'EOF\'')).toBe('EOF')
  })

  it('extracts a double-quoted delimiter', () => {
    expect(heredocDelimiter('cat << "EOF"')).toBe('EOF')
  })

  it('extracts a <<- delimiter', () => {
    expect(heredocDelimiter('\tcat <<- \'EOF\'')).toBe('EOF')
  })

  it('ignores << inside a quoted string', () => {
    expect(heredocDelimiter('echo "a << b"')).toBeNull()
  })

  it('ignores <<< here-strings', () => {
    expect(heredocDelimiter('grep foo <<< "$input"')).toBeNull()
  })
})
