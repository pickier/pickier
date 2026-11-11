import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { formatCode, formatImports } from '../../src/format'

const cases = [
  {
    imports: ["import type Emitter from 'node:events'", "import * as Events from 'node:events'", "import { EventEmitter } from 'node:events'"],
    body: 'export type Result = Emitter; export const result = [Events.EventEmitter, EventEmitter]',
  },
  {
    imports: ["import First from 'node:events'", "import Second from 'node:events'"],
    body: 'export const result = First === Second',
  },
  {
    imports: ["import * as First from 'node:events'", "import * as Second from 'node:events'"],
    body: 'export const result = First.EventEmitter === Second.EventEmitter',
  },
  {
    imports: ["import type{EventEmitter} from 'node:events'"],
    expected: ["import type { EventEmitter } from 'node:events'"],
    body: 'export type Result = EventEmitter',
  },
  {
    imports: ["import { type as\tvalue } from 'provider'"],
    expected: ["import { type as value } from 'provider'"],
    body: 'export const result = value',
  },
  {
    imports: ["import { type EventEmitter as Emitter } from 'node:events'"],
    expected: ["import type { EventEmitter as Emitter } from 'node:events'"],
    body: 'export type Result = Emitter',
  },
  {
    imports: ["import { EventEmitter, type EventEmitter as Emitter } from 'node:events'"],
    expected: ["import type { EventEmitter as Emitter } from 'node:events'"],
    body: 'export type Result = Emitter',
  },
  {
    imports: ["import { type as value } from 'provider'"],
    expected: ["import { type as value } from 'provider'"],
    body: 'export const result = value',
  },
  {
    imports: Array.from({ length: 40 }, (_, index) => `import type Emitter${index} from 'node:events'`),
    body: 'export type Result = [Emitter0, Emitter39]',
  },
  {
    imports: ["import type Emitter from 'node:events'"],
    body: 'export type Result = Emitter',
  },
  {
    imports: ["import type * as Events from 'node:events'"],
    body: 'export type Result = Events.EventEmitter',
  },
  {
    imports: ["import type First from 'node:events'", "import type Second from 'node:events'"],
    body: 'export type Result = [First, Second]',
  },
  {
    imports: ["import type * as First from 'node:events'", "import type * as Second from 'node:events'"],
    body: 'export type Result = [First.EventEmitter, Second.EventEmitter]',
  },
  {
    imports: ["import type Emitter from 'node:events'", "import type { EventEmitter as Named } from 'node:events'", "import type * as Events from 'node:events'"],
    body: 'export type Result = [Emitter, Named, Events.EventEmitter]',
  },
  {
    imports: ['// Constructor type', "import type Emitter from 'node:events'", '// Namespace type', "import type * as Events from 'node:events'"],
    body: 'export type Result = [Emitter, Events.EventEmitter]',
  },
  {
    imports: ["import type /* Constructor type */ Emitter from 'node:events'"],
    body: 'export type Result = Emitter',
  },
  {
    imports: ["import type Emitter from 'node:events' // Constructor type"],
    body: 'export type Result = Emitter',
  },
]

for (const [name, format] of [
  ['organizer', formatImports],
  ['formatter', (source: string) => formatCode(source, defaultConfig, 'index.ts')],
] as const) {
  describe(`${name} preserves type-only binding forms`, () => {
    for (const fixture of cases) {
      it(fixture.imports.join('; '), () => {
        const source = `${fixture.imports.join('\n')}\n\n${fixture.body}\n`
        const formatted = format(source)
        for (const statement of fixture.expected ?? fixture.imports) expect(formatted).toContain(statement)
        expect(format(formatted)).toBe(formatted)
      })
    }
    it('keeps a default value binding named type', () => {
      const source = "import type from 'provider'\n\nexport const value = type\n"
      expect(format(source)).toContain("import type from 'provider'")
    })
  })
}
