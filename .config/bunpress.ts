import type { BunPressOptions } from '@stacksjs/bunpress'

export default {
  verbose: false,

  nav: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'Configuration', link: '/config' },
    { text: 'Rules', link: '/rules/' },
    { text: 'CLI', link: '/cli' },
    { text: 'API', link: '/api/' },
    { text: 'GitHub', link: 'https://github.com/pickier/pickier' },
  ],

  markdown: {
    title: 'Pickier - Fast Linting & Formatting',
    meta: {
      description: 'Fast linting and formatting. Minimal defaults. Extensible. Built for speed with Bun.',
      author: 'Stacks.js',
    },

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Usage',
          items: [
            { text: 'CLI Commands', link: '/guide/cli' },
            { text: 'Programmatic API', link: '/guide/programmatic' },
            { text: 'CI/CD Integration', link: '/guide/ci-cd' },
          ],
        },
        {
          text: 'Rules',
          items: [
            { text: 'Overview', link: '/guide/rules-overview' },
            { text: 'ESLint Integration', link: '/guide/eslint' },
            { text: 'Custom Plugins', link: '/guide/plugins' },
          ],
        },
      ],
      '/features/': [
        {
          text: 'Features',
          items: [
            { text: 'Linting', link: '/features/linting' },
            { text: 'Formatting', link: '/features/formatting' },
            { text: 'Auto-Fix', link: '/features/auto-fix' },
            { text: 'Watch Mode', link: '/features/watch-mode' },
          ],
        },
      ],
      '/advanced/': [
        {
          text: 'Advanced',
          items: [
            { text: 'Configuration', link: '/advanced/configuration' },
            { text: 'Custom Rules', link: '/advanced/custom-rules' },
            { text: 'Performance', link: '/advanced/performance' },
            { text: 'CI/CD Integration', link: '/advanced/ci-cd' },
          ],
        },
      ],
      '/rules/': [
        { text: 'Rules Overview', link: '/rules/' },
        {
          text: 'Categories',
          items: [
            { text: 'General', link: '/rules/general' },
            { text: 'Quality', link: '/rules/quality' },
            { text: 'Style', link: '/rules/style' },
            { text: 'TypeScript', link: '/rules/typescript' },
            { text: 'Markdown', link: '/rules/markdown' },
            { text: 'RegExp', link: '/rules/regexp' },
          ],
        },
      ],
    },

    toc: {
      enabled: true,
      position: 'sidebar',
      minDepth: 2,
      maxDepth: 4,
    },

    syntaxHighlightTheme: 'github-dark',

    features: {
      containers: true,
      githubAlerts: true,
      codeBlocks: {
        lineNumbers: true,
        lineHighlighting: true,
      },
      emoji: true,
    },
  },

  sitemap: {
    enabled: true,
    baseUrl: 'https://pickier.dev',
  },

  robots: {
    enabled: true,
  },
} satisfies BunPressOptions as BunPressOptions
