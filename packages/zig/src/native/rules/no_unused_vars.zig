//! `general/no-unused-vars` - port of packages/pickier/src/rules/general/no-unused-vars.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/no-unused-vars");
