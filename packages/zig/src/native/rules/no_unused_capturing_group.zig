//! `regexp/no-unused-capturing-group` - port of packages/pickier/src/rules/regexp/no-unused-capturing-group.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("regexp/no-unused-capturing-group");
