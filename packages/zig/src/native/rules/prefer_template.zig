//! `general/prefer-template` - port of packages/pickier/src/rules/general/prefer-template.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/prefer-template");
