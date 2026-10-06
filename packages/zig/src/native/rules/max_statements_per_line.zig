//! `style/max-statements-per-line` - port of packages/pickier/src/rules/style/max-statements-per-line.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("style/max-statements-per-line");
