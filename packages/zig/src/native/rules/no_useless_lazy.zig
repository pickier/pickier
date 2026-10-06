//! `regexp/no-useless-lazy` - port of packages/pickier/src/rules/regexp/no-useless-lazy.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("regexp/no-useless-lazy");
