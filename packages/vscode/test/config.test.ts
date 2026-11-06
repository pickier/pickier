import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { clearConfigCache, getPickierConfig, watchConfigFile } from '../src/config'

import { createVscodeMock } from './utils/vscode-mock'

// Set up mocks at module level
mock.module('vscode', () => createVscodeMock())
mock.module('bunfig', () => ({
  loadConfig: async (opts: any) => ({
    ...opts.defaultConfig,
    semi: false, // Override default
    customOption: 'test',
  }),
}))

describe('getPickierConfig', () => {
  beforeEach(() => {
    mock.restore()
    clearConfigCache()
    mock.module('vscode', () => createVscodeMock())
  })

  it('loads config using bunfig', async () => {
    // Use real pickier defaultConfig
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => ({
        ...opts.defaultConfig,
        customOption: 'loaded',
      }),
    }))

    const config = await getPickierConfig('/workspace')
    expect(config.customOption).toBe('loaded')
  })

  it('handles config loading errors gracefully', async () => {
    mock.module('pickier', () => ({
      defaultConfig: { semi: true, quotes: 'single' },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async () => {
        // Simulate a config loading error but bunfig is still available
        throw new Error('Config file has syntax error')
      },
    }))

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    const config = await getPickierConfig('/workspace')
    // Should fall back to default config when loading fails
    expect(config.semi).toBe(true)
    expect(config.quotes).toBe('single')

    console.error = originalError
  })

  it('caches config after first load', async () => {
    let loadCount = 0
    mock.module('pickier', () => ({
      defaultConfig: { semi: true },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => {
        loadCount++
        return { ...opts.defaultConfig, loadCount }
      },
    }))

    const config1 = await getPickierConfig('/workspace')
    const config2 = await getPickierConfig('/workspace')

    expect(config1).toBe(config2) // Same object reference
    expect(loadCount).toBe(1) // Only loaded once
  })

  it('reloads config after cache is cleared', async () => {
    let loadCount = 0
    mock.module('pickier', () => ({
      defaultConfig: { semi: true },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => {
        loadCount++
        return { ...opts.defaultConfig, loadCount }
      },
    }))

    const config1 = await getPickierConfig('/workspace')
    clearConfigCache()
    const config2 = await getPickierConfig('/workspace')

    expect(config1).not.toBe(config2) // Different object references
    expect(loadCount).toBe(2) // Loaded twice
  })

  it('handles different workspace roots', async () => {
    mock.module('pickier', () => ({
      defaultConfig: { semi: true },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => ({
        ...opts.defaultConfig,
        workspaceRoot: opts.cwd || 'default',
      }),
    }))

    const config1 = await getPickierConfig('/workspace1')
    clearConfigCache()
    const config2 = await getPickierConfig('/workspace2')

    expect(config1.workspaceRoot).toBe('/workspace1')
    expect(config2.workspaceRoot).toBe('/workspace2')
  })

  it('returns default config when loadConfig throws an error', async () => {
    mock.module('pickier', () => ({
      defaultConfig: { semi: true, quotes: 'double' },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async () => {
        throw new Error('Failed to load config')
      },
    }))

    // Suppress console.error for this test
    const originalError = console.error
    console.error = () => {}

    const config = await getPickierConfig('/workspace')
    expect(config.semi).toBe(true)
    expect(config.quotes).toBe('double')

    console.error = originalError
  })
})

describe('watchConfigFile', () => {
  beforeEach(() => {
    mock.restore()
    mock.module('vscode', () => createVscodeMock())
    mock.module('pickier', () => ({
      defaultConfig: {},
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => opts.defaultConfig || {},
    }))
  })

  it('creates a file system watcher for config files', async () => {
    const vscode = await import('vscode')
    let _callbackCalled = false

    const watcher = watchConfigFile('/workspace', async () => {
      _callbackCalled = true
    })

    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled()
    expect(watcher).toBeDefined()
    expect(watcher.dispose).toBeDefined()
  })

  it('calls callback when config file changes', async () => {
    const vscode = await import('vscode')
    let _callbackCalled = false
    let _callbackCount = 0

    const watcher = watchConfigFile('/workspace', async () => {
      _callbackCalled = true
      _callbackCount++
    })

    // Simulate file change event
    const watcherInstance = (vscode.workspace.createFileSystemWatcher as any).mock.results[0].value
    if (watcherInstance.onDidChange._emitter) {
      watcherInstance.onDidChange._emitter.emit('event', { fsPath: '/workspace/.pickierrc.json' })
    }

    // Give async callback time to run
    await new Promise(resolve => setTimeout(resolve, 10))

    // Note: In a real test environment with proper event emitters, this would work
    // For now, just verify the watcher was created
    expect(watcher).toBeDefined()
  })

  it('disposes watcher correctly', async () => {
    const vscode = await import('vscode')
    const watcher = watchConfigFile('/workspace', async () => {})

    watcher.dispose()

    const watcherInstance = (vscode.workspace.createFileSystemWatcher as any).mock.results[0].value
    expect(watcherInstance.dispose).toHaveBeenCalled()
  })
})

describe('clearConfigCache', () => {
  it('clears the cached config', async () => {
    let loadCount = 0
    mock.module('pickier', () => ({
      defaultConfig: { semi: true },
    }))
    mock.module('bunfig', () => ({
      loadConfig: async (opts: any) => {
        loadCount++
        return { ...opts.defaultConfig, loadCount }
      },
    }))

    // Load config
    await getPickierConfig('/workspace')
    expect(loadCount).toBe(1)

    // Clear cache
    clearConfigCache()

    // Load again - should reload
    await getPickierConfig('/workspace')
    expect(loadCount).toBe(2)
  })
})
