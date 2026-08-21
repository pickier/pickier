import { describe, expect, it } from 'bun:test'
import { ENV } from '../../src/utils'

// The suite's own preconditions. Without these the failures you get are
// misdirection: `.config/pickier.ts` drops `sh`/`bash`/`zsh` from
// `lint.extensions` and re-tunes a dozen severities, so shell-rule tests
// report zero issues and pass/fail on the repo's lint preferences rather
// than on the code under test.
describe('test environment', () => {
  it('never auto-loads the repo config', () => {
    // Set by packages/pickier/test/preload.ts, wired into both bunfig.toml
    // files so `bun test` and `bun run test` agree from either directory.
    expect(process.env.PICKIER_NO_AUTO_CONFIG).toBe('1')
    expect(ENV.NO_AUTO_CONFIG).toBe(true)
  })
})
