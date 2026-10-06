//! `node/prefer-global/process` - port of packages/pickier/src/rules/node/prefer-global-process.ts
//!
//! A line (`/\r?\n/`), not a comment once trimmed, that imports or requires
//! `process` / `node:process`, reported at the import.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const pg_import = @import("pg_import.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        // The pattern needs the module name
        if (std.mem.indexOf(u8, line, "process") == null) continue;
        const trimmed = text.trim(line);
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) continue;
        const at = pg_import.importIndex(line, "process") orelse continue;
        try out.append(a, .{
            .line = @intCast(i + 1),
            .column = @intCast(text.utf16Index(line, at) + 1),
            .rule_id = "node/prefer-global/process",
            .message = "Unexpected import of 'process'. Use the global 'process' instead",
            .severity = .@"error",
            .help = "`process` is a global in Node.js — remove the import and use it directly.",
        });
    }
}
