//! `pickier/sort-tailwind-classes` - port of packages/pickier/src/rules/sort/tailwind-classes.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

pub const check = @import("../legacy.zig").adapter("pickier/sort-tailwind-classes");
