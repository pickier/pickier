export { config, defaultConfig } from './config'
export * from './format'
export { lintText, runLint, runLintProgrammatic } from './linter'
export { runFormat } from './formatter'
export { runUnified as run } from './run'

export type { RunOptions } from './run'

export * from './types'
export * from './utils'
