//! `style/brace-style` - port of packages/pickier/src/rules/style/brace-style.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("style/brace-style");
