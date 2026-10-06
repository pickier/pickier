import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LAZY_BUILTINS } from '../../build'

/**
 * The build gives bunfig stand-ins for node:crypto, node:zlib and
 * node:stream/promises that load the real module on first call (build.ts).
 * That is only the same as the real import while bunfig imports nothing but
 * functions from them - checked here against the installed bunfig, so an
 * update that imports anything else fails the build's tests instead of
 * breaking at runtime.
 */
describe('lazy built-ins in the build', () => {
  const bunfig = readFileSync(Bun.resolveSync('bunfig', __dirname), 'utf8')

  for (const [module, names] of Object.entries(LAZY_BUILTINS)) {
    it(`covers every import bunfig makes from ${module}`, () => {
      const imported = new Set<string>()
      for (const m of bunfig.matchAll(new RegExp(`import \\{([^}]*)\\} from "${module.replace('/', '\\/')}";`, 'g'))) {
        for (const spec of m[1]!.split(','))
          imported.add(spec.trim().split(/\s+as\s+/)[0]!)
      }
      // No default or namespace imports, which a stand-in could not provide
      expect(bunfig).not.toMatch(new RegExp(`import \\w+(?:, *\\{[^}]*\\})? from "${module.replace('/', '\\/')}";`))
      expect(bunfig).not.toMatch(new RegExp(`import \\* as \\w+ from "${module.replace('/', '\\/')}";`))
      expect([...imported].sort()).toEqual([...names].sort())
      const real = require(`node:${module}`)
      for (const name of names)
        expect(typeof real[name]).toBe('function')
    })
  }
})
