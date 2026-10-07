---
layout: home

hero:
  name: "Pickier"
  text: "Format, lint, and more in a fraction of seconds."
  tagline: "Fast CLI for consistent codebases."
  image: /images/logo-white.png
  actions:
    - theme: brand
      text: Get Started
      link: /intro
    - theme: alt
      text: View on GitHub
      link: https://github.com/pickier/pickier

features:
  - title: Fast Performance
    details: Blazing fast scanning powered by Bun runtime with optimized parallel processing and smart caching strategies.
  - title: One Tool, Multiple Functions
    details: Lint, format, and organize imports with a single unified CLI. No need for multiple tools in your workflow.
  - title: Highly Configurable
    details: Fine-grained control with 165+ rules across 11 plugins. Configure via pickier.config.ts, .js, or .json files.
  - title: ESLint Compatible
    details: Supports ESLint-style disable comments and configuration patterns for seamless migration from existing projects.
  - title: TypeScript First
    details: Built with TypeScript for TypeScript. Full type safety with native Bun runtime support for instant execution.
  - title: Smart Fixers
    details: Automatic code fixes with intelligent iteration. Fixes run up to 5 passes until code is clean and consistent.
  - title: Rich Rule Set
    details: Comprehensive rules for error detection, code quality, style consistency, TypeScript, RegExp, and Markdown linting.
  - title: Flexible Output
    details: Multiple reporter formats including stylish, JSON, and compact. Machine-readable and human-friendly options.
  - title: Import Organization
    details: Automatically sort and organize imports, deduplicate entries, and separate type imports from value imports.
---

<script setup>
import {
  VPTeamMembers
} from 'vitepress/theme'
import { core } from './_data/team'
</script>

## Meet the Team

<VPTeamMembers :members="core" />
