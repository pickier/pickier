//! `ts/no-top-level-await` - port of packages/pickier/src/rules/ts/no-top-level-await.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("ts/no-top-level-await");
