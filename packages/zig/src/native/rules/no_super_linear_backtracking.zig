//! `regexp/no-super-linear-backtracking` - port of packages/pickier/src/rules/regexp/no-super-linear-backtracking.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("regexp/no-super-linear-backtracking");
