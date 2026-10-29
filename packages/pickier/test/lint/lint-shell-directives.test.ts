import { describe, expect, it } from 'bun:test'
import { defaultConfig } from '../../src/config'
import { lintText } from '../../src/linter'

const config = { ...defaultConfig, pluginRules: { ...defaultConfig.pluginRules, 'shell/no-eval': 'warn' as const } }

describe('shell disable directives', () => {
  it('limits a documented exception to its next command', async () => {
    const source = [
      '#!/bin/sh',
      '# pickier-disable-next-line shell/no-eval -- Published activation API.',
      'eval "$speech_env"',
      'eval "$untrusted"',
      '',
    ].join('\n')
    const issues = await lintText(source, config, 'activation.sh')
    expect(issues.filter(issue => issue.ruleId === 'shell/no-eval').map(issue => issue.line)).toEqual([4])
  })

  it('reenables a named rule after a hash-comment range', async () => {
    const source = [
      '#!/bin/sh',
      '# eslint-disable shell/no-eval',
      'eval "$first"',
      '# eslint-enable shell/no-eval',
      'eval "$second"',
      '# not-pickier-disable-next-line shell/no-eval',
      'eval "$third"',
      '',
    ].join('\n')
    const issues = await lintText(source, config, 'activation.sh')
    expect(issues.filter(issue => issue.ruleId === 'shell/no-eval').map(issue => issue.line)).toEqual([5, 7])
  })
})
