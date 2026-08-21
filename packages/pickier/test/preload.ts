// Tests must not pick up the repo's own .config/pickier.ts: it narrows
// `lint.extensions` (no `sh`/`bash`/`zsh`) and re-tunes a dozen severities,
// so a suite that auto-loaded it would silently stop exercising whole rule
// sets and fail in ways that say nothing about the code under test.
//
// The `test` script sets this too. Setting it here as well means a bare
// `bun test` — the command a contributor reaches for first, and the one
// CLAUDE.md documents — behaves identically to `bun run test`, instead of
// producing failures that reproduce under only one of the two.
process.env.PICKIER_NO_AUTO_CONFIG ??= '1'
