//! Disable directives and comment-only lines, as the TypeScript linter
//! computes them: `parseDisableDirectives`, `isSuppressed` and
//! `getCommentLines` in packages/pickier/src/linter.ts.
//!
//! NOT PORTED YET: re-exports the older ../directives.zig.

const old = @import("../directives.zig");

pub const DisableDirectives = old.DisableDirectives;
pub const parseDisableDirectives = old.parseDisableDirectives;
pub const isSuppressed = old.isSuppressed;
pub const getCommentLines = old.getCommentLines;
