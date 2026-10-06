//! `general/prefer-const` - port of packages/pickier/src/rules/general/prefer-const.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/prefer-const");
