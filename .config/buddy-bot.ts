import type { BuddyBotConfig } from 'buddy-bot'

const config: BuddyBotConfig = {
  repository: {
    owner: 'stacksjs',
    name: 'pickier',
    provider: 'github',
    // token: process.env.BUDDY_BOT_TOKEN,
  },
  dashboard: {
    enabled: true,
    title: 'Dependency Dashboard',
    // issueNumber: undefined, // Auto-generated
  },
  workflows: {
    enabled: true,
    outputDir: '.github/workflows',
    templates: {
      daily: true,
      weekly: true,
      monthly: true,
    },
    custom: [],
  },
  packages: {
    strategy: 'all',
    ignore: [
      // `@types/vscode` is not an ordinary dependency to keep current: it has
      // to match `engines.vscode` in packages/vscode/package.json, the oldest
      // VS Code the extension claims to run on. Typing against a newer one
      // lets the extension call an API that is missing at runtime there, and
      // `vsce package` refuses to build at all while the two disagree. Raise
      // it by hand, together with `engines.vscode`, when dropping support for
      // older editors is the intent.
      '@types/vscode',
    ],
    ignorePaths: [
      // Add file/directory paths to ignore using glob patterns
      // Example: 'packages/test-*/**', '**/*test-envs/**', 'apps/legacy/**'
    ],
  },
  verbose: false,
}

export default config
