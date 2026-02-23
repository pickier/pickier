import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLimiter, glob } from '../../src/utils'

process.env.PICKIER_NO_AUTO_CONFIG = '1'

// ---------------------------------------------------------------------------
// createLimiter
// ---------------------------------------------------------------------------

describe('createLimiter', () => {
  it('runs all tasks and returns results', async () => {
    const limit = createLimiter(4)
    const results = await Promise.all([1, 2, 3].map(n => limit(() => Promise.resolve(n * 2))))
    expect(results).toEqual([2, 4, 6])
  })

  it('respects concurrency — never exceeds limit', async () => {
    const limit = createLimiter(2)
    let active = 0
    let maxActive = 0

    const task = () => limit(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(r => setTimeout(r, 10))
      active--
    })

    await Promise.all([task(), task(), task(), task(), task()])
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('concurrency of 1 runs tasks sequentially', async () => {
    const limit = createLimiter(1)
    const order: number[] = []

    await Promise.all([1, 2, 3].map(n =>
      limit(async () => {
        await new Promise(r => setTimeout(r, 5))
        order.push(n)
      }),
    ))

    expect(order).toEqual([1, 2, 3])
  })

  it('propagates rejections', async () => {
    const limit = createLimiter(2)
    await expect(limit(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
  })

  it('continues processing after a rejection', async () => {
    const limit = createLimiter(2)
    const results: Array<number | string> = []

    await Promise.allSettled([
      limit(() => Promise.reject(new Error('fail'))).catch(() => results.push('err')),
      limit(() => Promise.resolve(42)).then(v => results.push(v)),
      limit(() => Promise.resolve(99)).then(v => results.push(v)),
    ])

    expect(results).toContain('err')
    expect(results).toContain(42)
    expect(results).toContain(99)
  })

  it('handles concurrency larger than task count', async () => {
    const limit = createLimiter(100)
    const results = await Promise.all([1, 2, 3].map(n => limit(() => Promise.resolve(n))))
    expect(results).toEqual([1, 2, 3])
  })

  it('handles empty task list', async () => {
    const limit = createLimiter(4)
    const results = await Promise.all(([] as number[]).map(n => limit(() => Promise.resolve(n))))
    expect(results).toEqual([])
  })

  it('works with concurrency of 1 for a single task', async () => {
    const limit = createLimiter(1)
    const result = await limit(() => Promise.resolve('hello'))
    expect(result).toBe('hello')
  })
})

// ---------------------------------------------------------------------------
// glob
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'pickier-glob-test-'))
}

describe('glob', () => {
  it('finds files matching a simple pattern', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'a.ts'), '')
      writeFileSync(join(dir, 'b.ts'), '')
      writeFileSync(join(dir, 'c.js'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names.sort()).toEqual(['a.ts', 'b.ts'])
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('finds files in subdirectories', async () => {
    const dir = makeTmpDir()
    try {
      mkdirSync(join(dir, 'src'))
      mkdirSync(join(dir, 'src', 'nested'))
      writeFileSync(join(dir, 'src', 'index.ts'), '')
      writeFileSync(join(dir, 'src', 'nested', 'deep.ts'), '')
      writeFileSync(join(dir, 'root.ts'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true })
      const names = results.map(f => f.replace(dir + '/', '')).sort()
      expect(names).toContain('root.ts')
      expect(names).toContain('src/index.ts')
      expect(names).toContain('src/nested/deep.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('respects ignore patterns', async () => {
    const dir = makeTmpDir()
    try {
      mkdirSync(join(dir, 'node_modules'))
      writeFileSync(join(dir, 'node_modules', 'pkg.ts'), '')
      writeFileSync(join(dir, 'index.ts'), '')

      const results = await glob(['**/*.ts'], {
        cwd: dir,
        absolute: true,
        ignore: ['**/node_modules/**'],
      })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names).toContain('index.ts')
      expect(names).not.toContain('node_modules/pkg.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('ignores dotfiles when dot is false (default)', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, '.hidden.ts'), '')
      writeFileSync(join(dir, 'visible.ts'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true, dot: false })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names).toContain('visible.ts')
      expect(names).not.toContain('.hidden.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('includes dotfiles when dot is true', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, '.hidden.ts'), '')
      writeFileSync(join(dir, 'visible.ts'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true, dot: true })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names).toContain('visible.ts')
      expect(names).toContain('.hidden.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns absolute paths when absolute is true', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'a.ts'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true })
      expect(results.every(f => f.startsWith('/'))).toBe(true)
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns relative paths when absolute is false', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'a.ts'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: false })
      expect(results.every(f => !f.startsWith('/'))).toBe(true)
      expect(results).toContain('a.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array when no files match', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'a.js'), '')

      const results = await glob(['**/*.ts'], { cwd: dir, absolute: true })
      expect(results).toEqual([])
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles multiple patterns', async () => {
    const dir = makeTmpDir()
    try {
      writeFileSync(join(dir, 'a.ts'), '')
      writeFileSync(join(dir, 'b.js'), '')
      writeFileSync(join(dir, 'c.md'), '')

      const results = await glob(['**/*.ts', '**/*.js'], { cwd: dir, absolute: true })
      const names = results.map(f => f.replace(dir + '/', '')).sort()
      expect(names).toContain('a.ts')
      expect(names).toContain('b.js')
      expect(names).not.toContain('c.md')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('handles multiple ignore patterns', async () => {
    const dir = makeTmpDir()
    try {
      mkdirSync(join(dir, 'dist'))
      mkdirSync(join(dir, 'node_modules'))
      writeFileSync(join(dir, 'dist', 'out.ts'), '')
      writeFileSync(join(dir, 'node_modules', 'dep.ts'), '')
      writeFileSync(join(dir, 'src.ts'), '')

      const results = await glob(['**/*.ts'], {
        cwd: dir,
        absolute: true,
        ignore: ['**/dist/**', '**/node_modules/**'],
      })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names).toEqual(['src.ts'])
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty array for empty directory', async () => {
    const dir = makeTmpDir()
    try {
      const results = await glob(['**/*.ts'], { cwd: dir })
      expect(results).toEqual([])
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('single-star pattern does not cross directory boundaries', async () => {
    const dir = makeTmpDir()
    try {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'a.ts'), '')
      writeFileSync(join(dir, 'sub', 'b.ts'), '')

      const results = await glob(['*.ts'], { cwd: dir, absolute: true })
      const names = results.map(f => f.replace(dir + '/', ''))
      expect(names).toContain('a.ts')
      expect(names).not.toContain('sub/b.ts')
    }
    finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
