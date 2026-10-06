//! `pickier/no-import-dist` - port of packages/pickier/src/rules/imports/no-import-dist.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/no-import-dist");
