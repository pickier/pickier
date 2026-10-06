//! `node/prefer-global/buffer` - port of packages/pickier/src/rules/node/prefer-global-buffer.ts
//!
//! A line (`/\r?\n/`), not a comment once trimmed, that imports or requires
//! `buffer` / `node:buffer` and has a `/\bBuffer\b/` anywhere, reported at
//! the import.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");
const pg_import = @import("pg_import.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        // The pattern needs the module name
        if (std.mem.indexOf(u8, line, "buffer") == null) continue;
        const trimmed = text.trim(line);
        if (std.mem.startsWith(u8, trimmed, "//") or std.mem.startsWith(u8, trimmed, "/*") or std.mem.startsWith(u8, trimmed, "*")) continue;
        const at = pg_import.importIndex(line, "buffer") orelse continue;
        if (!hasBufferWord(line)) continue;
        try out.append(a, .{
            .line = @intCast(i + 1),
            .column = @intCast(text.utf16Index(line, at) + 1),
            .rule_id = "node/prefer-global/buffer",
            .message = "Unexpected import of 'Buffer'. Use the global 'Buffer' instead",
            .severity = .@"error",
            .help = "`Buffer` is a global in Node.js — remove the import and use it directly.",
        });
    }
}

/// `/\bBuffer\b/`
fn hasBufferWord(line: []const u8) bool {
    var from: usize = 0;
    while (std.mem.indexOfPos(u8, line, from, "Buffer")) |k| {
        from = k + 1;
        if (k > 0 and text.isWordByte(line[k - 1])) continue;
        if (k + 6 < line.len and text.isWordByte(line[k + 6])) continue;
        return true;
    }
    return false;
}

test "Buffer word" {
    try std.testing.expect(hasBufferWord("{ Buffer }"));
    try std.testing.expect(hasBufferWord("Buffer"));
    try std.testing.expect(!hasBufferWord("ArrayBuffer, Buffers"));
    try std.testing.expect(hasBufferWord("ArrayBuffer, $Buffer"));
}
