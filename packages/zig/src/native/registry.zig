//! Plugin rules the native engine can run, by their TypeScript plan id.
//! Each lives in rules/, one file per rule, as a line-for-line port of its
//! TypeScript source checked by scripts/parity.ts.

const std = @import("std");
const types = @import("types.zig");

const Entry = struct { id: []const u8, check: types.CheckFn };

const entries = [_]Entry{
    .{ .id = "general/no-unused-vars", .check = @import("rules/no_unused_vars.zig").check },
    .{ .id = "general/prefer-const", .check = @import("rules/prefer_const.zig").check },
    .{ .id = "general/prefer-template", .check = @import("rules/prefer_template.zig").check },
    .{ .id = "pickier/import-dedupe", .check = @import("rules/import_dedupe.zig").check },
    .{ .id = "pickier/no-unused-imports", .check = @import("rules/no_unused_imports.zig").check },
    .{ .id = "pickier/no-import-dist", .check = @import("rules/no_import_dist.zig").check },
    .{ .id = "pickier/no-import-node-modules-by-path", .check = @import("rules/no_import_node_modules_by_path.zig").check },
    .{ .id = "pickier/sort-tailwind-classes", .check = @import("rules/sort_tailwind_classes.zig").check },
    .{ .id = "style/brace-style", .check = @import("rules/brace_style.zig").check },
    .{ .id = "style/max-statements-per-line", .check = @import("rules/max_statements_per_line.zig").check },
    .{ .id = "regexp/no-super-linear-backtracking", .check = @import("rules/no_super_linear_backtracking.zig").check },
    .{ .id = "regexp/no-unused-capturing-group", .check = @import("rules/no_unused_capturing_group.zig").check },
    .{ .id = "regexp/no-useless-lazy", .check = @import("rules/no_useless_lazy.zig").check },
    .{ .id = "ts/no-top-level-await", .check = @import("rules/no_top_level_await.zig").check },
};

pub fn lookup(id: []const u8) ?types.CheckFn {
    for (entries) |e| {
        if (std.mem.eql(u8, e.id, id)) return e.check;
    }
    return null;
}
