//! `style/no-trailing-spaces` - port of packages/pickier/src/rules/style/no-trailing-spaces.ts
//!
//! Per line (`/\r?\n/`), `/(\s+)$/`: the run of JavaScript whitespace that
//! ends the line, reported at its first character. A lone `\r` is whitespace,
//! so a line ending in one is reported too.

const std = @import("std");
const types = @import("../types.zig");
const text = @import("../text.zig");

pub fn check(ctx: *const types.RuleContext, out: *std.ArrayList(types.Issue)) anyerror!void {
    const a = ctx.allocator;
    const lines = try text.splitLines(a, ctx.content);
    for (lines, 0..) |line, i| {
        if (line.len == 0) continue;
        // The last byte decides for ASCII; anything else may be U+00A0 and the like
        const last = line[line.len - 1];
        if (last < 0x80 and !text.isAsciiSpace(last)) continue;
        const kept = text.trimEnd(line);
        if (kept.len == line.len) continue;
        try out.append(a, .{
            .line = @intCast(i + 1),
            // `line.length - trailing.length + 1`
            .column = @intCast(text.utf16Len(kept) + 1),
            .rule_id = "style/no-trailing-spaces",
            .message = "Trailing spaces not allowed",
            .severity = .@"error",
            .help = "Remove trailing whitespace from the end of this line.",
        });
    }
}
