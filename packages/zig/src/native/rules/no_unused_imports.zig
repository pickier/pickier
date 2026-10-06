//! `pickier/no-unused-imports` - port of packages/pickier/src/rules/imports/no-unused-imports.ts
//!
//! NOT PORTED YET: delegates to the older implementation (or reports nothing).

const std = @import("std");
const types = @import("../types.zig");

pub fn check(_: *const types.RuleContext, _: *std.ArrayList(types.Issue)) anyerror!void {}
