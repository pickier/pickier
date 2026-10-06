//! `pickier/import-dedupe` - port of packages/pickier/src/rules/imports/import-dedupe.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/import-dedupe");
