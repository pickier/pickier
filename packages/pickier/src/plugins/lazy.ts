import type { PickierPlugin, RuleModule } from '../types'
import { eslintPlugin } from './eslint'
import { generalPlugin } from './general'
import { LAZY_PLUGIN_RULES } from './manifest'
import { nodePlugin } from './node'
import { perfectionistPlugin } from './perfectionist'
import { pickierPlugin } from './pickier'
import { qualityPlugin } from './quality'
import { regexpPlugin } from './regexp'
import { stylePlugin } from './style'
import { tsPlugin } from './ts'
import { unusedImportsPlugin } from './unused-imports'

type LazyName = keyof typeof LAZY_PLUGIN_RULES

/*
 * Loaded with `require` so a rule can load its plugin from a synchronous call
 * (`fixText` is synchronous). Bun runs these ES modules synchronously; the
 * bundler keeps each one unevaluated until its first require.
 */
/* eslint-disable ts/no-require-imports */
const loaders: Record<LazyName, () => PickierPlugin> = {
  markdown: () => require('./markdown').markdownPlugin,
  shell: () => require('./shell').shellPlugin,
  spell: () => require('./spell').spellPlugin,
  lockfile: () => require('./lockfile').lockfilePlugin,
  publint: () => require('./publint').publintPlugin,
}
/* eslint-enable ts/no-require-imports */

const loaded = new Map<LazyName, PickierPlugin>()

function load(name: LazyName): PickierPlugin {
  let plugin = loaded.get(name)
  if (!plugin) {
    plugin = loaders[name]()
    loaded.set(name, plugin)
  }
  return plugin
}

/**
 * A stand-in for a lazy plugin's rule: same name, same `fix` presence, and
 * `check`, `fix` and `meta` that load the plugin and defer to the real rule.
 */
function stubRule(plugin: LazyName, ruleName: string, fixable: boolean): RuleModule {
  const real = (): RuleModule => load(plugin).rules[ruleName]!
  const stub: RuleModule = {
    get meta() {
      return real().meta
    },
    check: (content, ctx) => real().check(content, ctx),
  }
  if (fixable)
    stub.fix = (content, ctx) => real().fix!(content, ctx)
  return stub
}

function lazyPlugin(name: LazyName): PickierPlugin {
  const rules: Record<string, RuleModule> = {}
  for (const [ruleName, fixable] of Object.entries(LAZY_PLUGIN_RULES[name]))
    rules[ruleName] = stubRule(name, ruleName, fixable)
  return { name, rules }
}

let plugins: PickierPlugin[] | null = null

/**
 * The core plugins, in the same order as `getAllPlugins`, with the non-code
 * plugins replaced by stand-ins that load on first use. A rule's plan, its
 * options and which duplicate rule name wins are all decided from names, so
 * they come out the same; only the loading moves to when a rule runs.
 */
export function getLazyPlugins(): PickierPlugin[] {
  plugins ??= [
    eslintPlugin,
    generalPlugin,
    qualityPlugin,
    pickierPlugin,
    stylePlugin,
    regexpPlugin,
    tsPlugin,
    lazyPlugin('markdown'),
    lazyPlugin('shell'),
    lazyPlugin('spell'),
    nodePlugin,
    lazyPlugin('lockfile'),
    lazyPlugin('publint'),
    unusedImportsPlugin,
    perfectionistPlugin,
  ]
  return [...plugins]
}
